import { createHarness, randomPhone, type Harness, type TestPg } from "./harness";

/**
 * Deposit-covers-rent: a manager settles a rent invoice from the resident's held
 * deposit ("use my deposit for this month's rent"). The invoice flips to PAID,
 * the deposit stays HELD with a reduced balance, and a later exit refunds only
 * what's LEFT — the full sequence (apply → exit) is what proves the deposit isn't
 * double-counted.
 */
describe("Deposit applied to rent (e2e)", () => {
  let h: Harness;
  let pgA: TestPg;
  let pgB: TestPg;

  const ROOM_RENT = 800000; // ₹8,000/mo
  const DEPOSIT = 1500000; // ₹15,000 (~ < 2 months)

  let r1Id: string;
  let r1: string; // resident token
  let r2Id: string;
  let r2: string;

  async function newId(res: {
    status: number;
    body: { id: string };
  }): Promise<string> {
    if (res.status !== 201 && res.status !== 200)
      throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.id;
  }

  beforeAll(async () => {
    h = await createHarness();
    pgA = await h.onboardPg("apply-a");
    pgB = await h.onboardPg("apply-b");
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

    const p1 = randomPhone();
    const p2 = randomPhone();
    r1Id = await h.registerResident(mgr, { name: "Res One", phone: p1 });
    r2Id = await h.registerResident(mgr, { name: "Res Two", phone: p2 });
    r1 = await h.residentLogin(pgA.slug, pgA.id, p1);
    r2 = await h.residentLogin(pgA.slug, pgA.id, p2);
    await h.req("post", "/allocations", mgr, {
      bedId: bed1,
      residentId: r1Id,
      startDate: "2026-06-01",
    });
    await h.req("post", "/allocations", mgr, {
      bedId: bed2,
      residentId: r2Id,
      startDate: "2026-06-01",
    });
    await h.req("post", "/deposits", mgr, {
      residentId: r1Id,
      amountPaise: DEPOSIT,
    });
    await h.req("post", "/deposits", mgr, {
      residentId: r2Id,
      amountPaise: DEPOSIT,
    });
    // Full-month invoices for 2026-06 (start = 2026-06-01).
    await h.req("post", "/invoices/generate", mgr, { period: "2026-06" });
  }, 30000);

  afterAll(async () => {
    await h?.close();
  });

  let inv1June: string;

  it("applies the deposit to a rent invoice → invoice PAID, balance reduced", async () => {
    inv1June = (await h.req("get", "/invoices/mine", r1)).body[0].id;

    const res = await h.req("post", "/deposits/apply-to-invoice", pgA.managerToken, {
      invoiceId: inv1June,
    });
    expect(res.status).toBe(201);
    expect(res.body.amountPaise).toBe(ROOM_RENT);
    expect(res.body.period).toBe("2026-06");
    expect(res.body.depositBalancePaise).toBe(DEPOSIT - ROOM_RENT);

    // Invoice is now PAID.
    const mine = await h.req("get", "/invoices/mine", r1);
    expect(mine.body[0].status).toBe("PAID");

    // Deposit stays HELD; ledger shows a DEDUCTION tagged with the period.
    const dep = await h.req("get", `/deposits/resident/${r1Id}`, pgA.managerToken);
    expect(dep.body.deposit.status).toBe("HELD");
    const deduction = dep.body.ledger.find(
      (t: { type: string; period: string | null }) => t.type === "DEDUCTION",
    );
    expect(deduction.period).toBe("2026-06");
    expect(deduction.amountPaise).toBe(ROOM_RENT);
  });

  it("rejects a double-apply to the same invoice (409)", async () => {
    const res = await h.req("post", "/deposits/apply-to-invoice", pgA.managerToken, {
      invoiceId: inv1June,
    });
    expect(res.status).toBe(409);
  });

  it("rejects when the remaining balance can't cover the invoice (409)", async () => {
    // 2026-07 invoice is another ROOM_RENT; remaining balance is now < ROOM_RENT.
    await h.req("post", "/invoices/generate", pgA.managerToken, {
      period: "2026-07",
    });
    const july = (await h.req("get", "/invoices/mine", r1)).body.find(
      (i: { period: string }) => i.period === "2026-07",
    );
    const res = await h.req("post", "/deposits/apply-to-invoice", pgA.managerToken, {
      invoiceId: july.id,
    });
    expect(res.status).toBe(409);
  });

  it("rejects applying to a voided invoice (404)", async () => {
    const inv2 = (await h.req("get", "/invoices/mine", r2)).body[0].id;
    await h.req("post", `/invoices/${inv2}/delete`, pgA.managerToken, {
      reason: "duplicate",
    });
    const res = await h.req("post", "/deposits/apply-to-invoice", pgA.managerToken, {
      invoiceId: inv2,
    });
    expect(res.status).toBe(404);
  });

  it("does not let another tenant apply to this invoice (404, RLS)", async () => {
    const res = await h.req("post", "/deposits/apply-to-invoice", pgB.managerToken, {
      invoiceId: inv1June,
    });
    expect(res.status).toBe(404);
  });

  it("on exit, refunds only the remaining balance (no double-count)", async () => {
    const res = await h.req("post", "/deposits/exit", pgA.managerToken, {
      residentId: r1Id,
      deductions: [],
    });
    expect(res.status).toBe(201);
    expect(res.body.depositPaise).toBe(DEPOSIT);
    expect(res.body.priorDeductionsPaise).toBe(ROOM_RENT);
    expect(res.body.availablePaise).toBe(DEPOSIT - ROOM_RENT);
    expect(res.body.refundPaise).toBe(DEPOSIT - ROOM_RENT);
  });

  it("rejects exit deductions beyond the remaining balance (409)", async () => {
    // r2 still HELD (DEPOSIT), nothing applied → deduction over DEPOSIT fails.
    const res = await h.req("post", "/deposits/exit", pgA.managerToken, {
      residentId: r2Id,
      deductions: [{ reason: "Damage", amountPaise: DEPOSIT + 1 }],
    });
    expect(res.status).toBe(409);
  });
});
