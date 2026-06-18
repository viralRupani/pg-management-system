import { createHarness, randomPhone, type Harness, type TestPg } from "./harness";

/**
 * Invoice soft-delete (void) e2e. A manager voids an invoice with a mandatory
 * reason: it stays in the list (shown with the reason) but is no longer owed —
 * the resident can't pay it, overdue-marking skips it, a double-delete 409s, and
 * the void is tenant-isolated.
 *
 * Residents start 2026-06-01 and invoices are generated for 2026-06 so amounts
 * are a clean full-month ROOM_RENT.
 */
describe("Invoice soft-delete (e2e)", () => {
  let h: Harness;
  let pgA: TestPg;
  const ROOM_RENT = 800000;

  let res1Id: string;
  let res1: string; // token
  let inv1: string; // resident1's 2026-06 invoice
  let res2: string; // token — reserved for the submit→void→approve path
  let res2Id: string;
  let inv2: string; // resident2's 2026-06 invoice

  async function newId(res: {
    status: number;
    body: { id: string };
  }): Promise<string> {
    if (res.status !== 201 && res.status !== 200)
      throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.id;
  }

  type Inv = {
    id: string;
    residentId: string;
    status: string;
    deletedAt: string | null;
    deletedReason: string | null;
  };
  async function invoices(): Promise<Inv[]> {
    return (await h.req("get", "/invoices?limit=100", pgA.managerToken)).body.items;
  }

  beforeAll(async () => {
    h = await createHarness();
    pgA = await h.onboardPg("invdel-a");
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
      startDate: "2026-06-01",
    });
    await h.req("post", "/allocations", mgr, {
      bedId: bed2,
      residentId: res2Id,
      startDate: "2026-06-01",
    });

    await h.req("post", "/invoices/generate", mgr, { period: "2026-06" });
    inv1 = (await h.req("get", "/invoices/mine", res1)).body[0].id;
    inv2 = (await h.req("get", "/invoices/mine", res2)).body[0].id;
  }, 30000);

  afterAll(async () => {
    await h?.close();
  });

  it("requires a reason to delete (400 on empty)", async () => {
    const res = await h.req("post", `/invoices/${inv1}/delete`, pgA.managerToken, {
      reason: "",
    });
    expect(res.status).toBe(400);
  });

  it("voids the invoice but keeps it listed with the reason", async () => {
    const del = await h.req("post", `/invoices/${inv1}/delete`, pgA.managerToken, {
      reason: "Billed in error — resident already paid offline",
    });
    expect(del.status).toBe(201);
    expect(del.body.deletedAt).toBeTruthy();

    const list = await invoices();
    const row = list.find((i) => i.id === inv1)!;
    expect(row).toBeDefined(); // still listed
    expect(row.deletedAt).toBeTruthy();
    expect(row.deletedReason).toBe(
      "Billed in error — resident already paid offline",
    );

    // The resident also sees the cancelled invoice + reason.
    const mine = (await h.req("get", "/invoices/mine", res1)).body.find(
      (i: Inv) => i.id === inv1,
    );
    expect(mine.deletedAt).toBeTruthy();
    expect(mine.deletedReason).toContain("Billed in error");
  });

  it("a resident cannot pay a voided invoice (409)", async () => {
    const submit = await h.req("post", "/payments", res1, {
      invoiceId: inv1,
      screenshotKey: "shot-x",
    });
    expect(submit.status).toBe(409);
  });

  it("overdue-marking skips a voided invoice", async () => {
    // inv1 was due 2026-06-10; today (harness clock) is past it. Mark overdue for
    // the whole tenant set — the voided invoice must NOT flip to OVERDUE.
    await h.req("post", "/platform/jobs/mark-overdue", h.platformToken(), {
      period: "2026-06",
    });
    const row = (await invoices()).find((i) => i.id === inv1)!;
    expect(row.status).not.toBe("OVERDUE");
  });

  it("double-delete is a 409", async () => {
    const again = await h.req(
      "post",
      `/invoices/${inv1}/delete`,
      pgA.managerToken,
      { reason: "again" },
    );
    expect(again.status).toBe(409);
  });

  it("approving a payment submitted before the void does NOT resurrect the invoice", async () => {
    // Resident2 submits a payment, THEN the manager voids the invoice. Approving
    // the still-SUBMITTED payment must 409 and leave the invoice cancelled+unpaid.
    const submit = await h.req("post", "/payments", res2, {
      invoiceId: inv2,
      screenshotKey: "shot-r2",
    });
    expect(submit.status).toBe(201);
    const paymentId = submit.body.id;

    const del = await h.req("post", `/invoices/${inv2}/delete`, pgA.managerToken, {
      reason: "Resident moved out mid-cycle",
    });
    expect(del.status).toBe(201);

    const approve = await h.req(
      "post",
      `/payments/${paymentId}/approve`,
      pgA.managerToken,
    );
    expect(approve.status).toBe(409);

    // Invoice stays cancelled and not PAID; the payment stays SUBMITTED.
    const row = (await invoices()).find((i) => i.id === inv2)!;
    expect(row.deletedAt).toBeTruthy();
    expect(row.status).not.toBe("PAID");
    const stillSubmitted = await h.req(
      "get",
      "/payments?status=SUBMITTED",
      pgA.managerToken,
    );
    expect(
      stillSubmitted.body.some((p: { id: string }) => p.id === paymentId),
    ).toBe(true);
  });

  it("delete is tenant-isolated", async () => {
    const pgB = await h.onboardPg("invdel-b");
    // Tenant B manager cannot see or void tenant A's invoice.
    const list = await h.req("get", "/invoices?limit=100", pgB.managerToken);
    expect(list.body.items.some((i: Inv) => i.id === inv1)).toBe(false);
    const del = await h.req("post", `/invoices/${inv1}/delete`, pgB.managerToken, {
      reason: "cross-tenant attempt",
    });
    expect(del.status).toBe(404);
  });
});
