import { istPeriod } from "../common/ist-date";
import { createHarness, randomPhone, type Harness, type TestPg } from "./harness";

/** 'YYYY-MM' shifted by `n` calendar months (n may be negative). */
function addMonths(period: string, n: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Extra-charges e2e: a manager adds one-time / recurring monthly charges to a
 * resident. Covers the apply-now path (fold into the resident's current open
 * invoice + record a breakdown line), the SUBMITTED-payment guard (queue instead
 * of silently inflating an invoice awaiting approval), monthly recurrence +
 * one-time-once across periods, soft-remove (stop future, keep history), and
 * both tenant + intra-tenant isolation.
 *
 * The harness clock is NOT frozen, and `ChargesService` apply-now targets
 * `istPeriod(new Date())` — the REAL current period. So periods here are computed
 * relative to now: P0 = current (apply-now target), P1/P2 = the next two months.
 * Residents start on the 1st of P0 so every month bills a full ROOM_RENT (no
 * proration noise). (Previously these were hardcoded to 2026-06/07/08, which
 * silently began failing once the wall clock passed June 2026.)
 */
describe("Extra charges (e2e)", () => {
  let h: Harness;
  let pgA: TestPg;
  const ROOM_RENT = 800000;
  const P0 = istPeriod(new Date()); // current IST period = apply-now target
  const P1 = addMonths(P0, 1); // next month
  const P2 = addMonths(P0, 2); // month after

  let res1Id: string;
  let res2Id: string;
  let res1: string; // token
  let res2: string; // token
  let res1InvCur: string; // resident1's P0 (current-period) invoice id
  let res2InvCur: string; // resident2's P0 (current-period) invoice id

  async function newId(res: {
    status: number;
    body: { id: string };
  }): Promise<string> {
    if (res.status !== 201 && res.status !== 200)
      throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.id;
  }

  type Inv = { id: string; residentId: string; amountPaise: number; status: string };

  async function invoices(): Promise<Inv[]> {
    return (await h.req("get", "/invoices?limit=100", pgA.managerToken)).body.items;
  }
  function byId(items: Inv[], id: string): Inv {
    const found = items.find((i) => i.id === id);
    if (!found) throw new Error(`invoice ${id} not in list`);
    return found;
  }
  function byResidentPeriod(items: Inv[], residentId: string): Inv | undefined {
    return items.find((i) => i.residentId === residentId);
  }
  async function chargesOf(residentId: string) {
    return (
      await h.req("get", `/charges?residentId=${residentId}`, pgA.managerToken)
    ).body as {
      id: string;
      label: string;
      active: boolean;
      appliedAt: string | null;
    }[];
  }

  beforeAll(async () => {
    h = await createHarness();
    pgA = await h.onboardPg("charges-a");
    const mgr = pgA.managerToken;

    const buildingId = await newId(
      await h.req("post", "/property/buildings", mgr, { name: "Block A" }),
    );
    const floorId = await newId(
      await h.req("post", "/property/floors", mgr, { buildingId, label: "G" }),
    );
    const roomId = await newId(
      await h.req("post", "/property/rooms", mgr, {
        floorId,
        label: "101",
        capacity: 2,
        monthlyRentPaise: ROOM_RENT,
      }),
    );
    const bed1 = await newId(
      await h.req("post", "/property/beds", mgr, { roomId, label: "A" }),
    );
    const bed2 = await newId(
      await h.req("post", "/property/beds", mgr, { roomId, label: "B" }),
    );

    const phone1 = randomPhone();
    const phone2 = randomPhone();
    res1Id = await h.registerResident(mgr, { name: "Res One", phone: phone1 });
    res2Id = await h.registerResident(mgr, { name: "Res Two", phone: phone2 });
    res1 = await h.residentLogin(pgA.slug, pgA.id, phone1);
    res2 = await h.residentLogin(pgA.slug, pgA.id, phone2);

    await h.req("post", "/allocations", mgr, {
      bedId: bed1,
      residentId: res1Id,
      startDate: `${P0}-01`,
    });
    await h.req("post", "/allocations", mgr, {
      bedId: bed2,
      residentId: res2Id,
      startDate: `${P0}-01`,
    });

    // Current-period invoices (P0 = istPeriod(now), the apply-now target).
    const gen = await h.req("post", "/invoices/generate", mgr, { period: P0 });
    expect(gen.body.generated).toBe(2);
    res1InvCur = (await h.req("get", "/invoices/mine", res1)).body[0].id;
    res2InvCur = (await h.req("get", "/invoices/mine", res2)).body[0].id;
  }, 30000);

  afterAll(async () => {
    await h?.close();
  });

  it("one-time charge folds into the current open invoice + records a labelled line", async () => {
    const created = await h.req("post", "/charges", pgA.managerToken, {
      residentId: res1Id,
      label: "Broken window repair",
      amountPaise: 50000,
      frequency: "ONE_TIME",
    });
    expect(created.status).toBe(201);
    expect(created.body.appliedToInvoiceId).toBe(res1InvCur);

    expect(byId(await invoices(), res1InvCur).amountPaise).toBe(ROOM_RENT + 50000);

    const breakdown = await h.req(
      "get",
      `/invoices/${res1InvCur}/charges`,
      pgA.managerToken,
    );
    expect(breakdown.body).toHaveLength(1);
    expect(breakdown.body[0].label).toBe("Broken window repair");
    expect(breakdown.body[0].amountPaise).toBe(50000);

    const oneTime = (await chargesOf(res1Id)).find(
      (c) => c.label === "Broken window repair",
    )!;
    expect(oneTime.appliedAt).not.toBeNull(); // consumed once
  });

  it("monthly charge folds into the current invoice and stays active for recurrence", async () => {
    const created = await h.req("post", "/charges", pgA.managerToken, {
      residentId: res1Id,
      label: "Laundry",
      amountPaise: 20000,
      frequency: "MONTHLY",
    });
    expect(created.body.appliedToInvoiceId).toBe(res1InvCur);

    expect(byId(await invoices(), res1InvCur).amountPaise).toBe(
      ROOM_RENT + 50000 + 20000,
    );
    const breakdown = await h.req(
      "get",
      `/invoices/${res1InvCur}/charges`,
      pgA.managerToken,
    );
    expect(breakdown.body).toHaveLength(2);

    const laundry = (await chargesOf(res1Id)).find((c) => c.label === "Laundry")!;
    expect(laundry.appliedAt).toBeNull(); // recurs — not consumed
    expect(laundry.active).toBe(true);
  });

  it("a resident sees their own invoice breakdown but not another resident's", async () => {
    const mine = await h.req("get", `/invoices/${res1InvCur}/charges`, res1);
    expect(mine.body).toHaveLength(2);

    const cross = await h.req("get", `/invoices/${res1InvCur}/charges`, res2);
    expect(cross.body).toHaveLength(0); // res2 cannot read res1's lines
  });

  it("does NOT apply to a current invoice with a SUBMITTED payment — queues instead", async () => {
    // Resident2 submits a payment against their current-period invoice → SUBMITTED.
    const submit = await h.req("post", "/payments", res2, {
      invoiceId: res2InvCur,
      screenshotKey: "shot-r2",
    });
    expect(submit.status).toBe(201);

    const created = await h.req("post", "/charges", pgA.managerToken, {
      residentId: res2Id,
      label: "Late fee",
      amountPaise: 10000,
      frequency: "ONE_TIME",
    });
    expect(created.status).toBe(201);
    expect(created.body.appliedToInvoiceId).toBeNull(); // queued, not applied now

    // Invoice untouched, no breakdown line, charge still pending (appliedAt null).
    expect(byId(await invoices(), res2InvCur).amountPaise).toBe(ROOM_RENT);
    const breakdown = await h.req(
      "get",
      `/invoices/${res2InvCur}/charges`,
      pgA.managerToken,
    );
    expect(breakdown.body).toHaveLength(0);
    const lateFee = (await chargesOf(res2Id)).find((c) => c.label === "Late fee")!;
    expect(lateFee.appliedAt).toBeNull();
  });

  it("next month: monthly recurs once, one-time does not, queued one-time lands; re-run idempotent", async () => {
    const gen = await h.req("post", "/invoices/generate", pgA.managerToken, {
      period: P1,
    });
    expect(gen.body.generated).toBe(2);
    const invP1 = await invoices();

    // Resident1: base rent + monthly laundry only (one-time was already consumed).
    const r1P1 = byResidentPeriod(
      invP1.filter((i) => i.id !== res1InvCur && i.residentId === res1Id),
      res1Id,
    )!;
    expect(r1P1.amountPaise).toBe(ROOM_RENT + 20000);
    const r1P1Breakdown = await h.req(
      "get",
      `/invoices/${r1P1.id}/charges`,
      pgA.managerToken,
    );
    expect(r1P1Breakdown.body).toHaveLength(1);
    expect(r1P1Breakdown.body[0].label).toBe("Laundry");

    // Resident2: the queued one-time "Late fee" now lands on the P1 invoice.
    const r2P1 = invP1.find(
      (i) => i.residentId === res2Id && i.id !== res2InvCur,
    )!;
    expect(r2P1.amountPaise).toBe(ROOM_RENT + 10000);

    // Re-running P1 is idempotent — no new invoices, no duplicated charge line.
    const again = await h.req("post", "/invoices/generate", pgA.managerToken, {
      period: P1,
    });
    expect(again.body.generated).toBe(0);
    const r1P1Breakdown2 = await h.req(
      "get",
      `/invoices/${r1P1.id}/charges`,
      pgA.managerToken,
    );
    expect(r1P1Breakdown2.body).toHaveLength(1); // still one Laundry line
  });

  it("removing a monthly charge stops future months but keeps billed history", async () => {
    const laundry = (await chargesOf(res1Id)).find((c) => c.label === "Laundry")!;
    const removed = await h.req(
      "post",
      `/charges/${laundry.id}/remove`,
      pgA.managerToken,
    );
    expect(removed.status).toBe(201);
    expect((await chargesOf(res1Id)).find((c) => c.id === laundry.id)!.active).toBe(
      false,
    );

    // P2: resident1 billed base rent only — laundry no longer applies.
    await h.req("post", "/invoices/generate", pgA.managerToken, { period: P2 });
    const r1P2 = (await invoices()).find(
      (i) => i.residentId === res1Id && i.amountPaise === ROOM_RENT,
    );
    expect(r1P2).toBeDefined();

    // The already-billed P1 laundry line is untouched.
    const r1P1 = (await invoices()).find(
      (i) => i.residentId === res1Id && i.amountPaise === ROOM_RENT + 20000,
    )!;
    const p1Breakdown = await h.req(
      "get",
      `/invoices/${r1P1.id}/charges`,
      pgA.managerToken,
    );
    expect(p1Breakdown.body).toHaveLength(1);
  });

  it("charges are tenant-isolated", async () => {
    const pgB = await h.onboardPg("charges-b");
    // Tenant B manager cannot see tenant A resident's charges (empty list).
    const list = await h.req(
      "get",
      `/charges?residentId=${res1Id}`,
      pgB.managerToken,
    );
    expect(list.body).toHaveLength(0);
    // Nor tenant A's invoice breakdown.
    const breakdown = await h.req(
      "get",
      `/invoices/${res1InvCur}/charges`,
      pgB.managerToken,
    );
    expect(breakdown.body).toHaveLength(0);
  });
});
