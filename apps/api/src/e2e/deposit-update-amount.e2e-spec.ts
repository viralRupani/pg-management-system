import { createHarness, randomPhone, type Harness, type TestPg } from "./harness";

/**
 * Adjust a held deposit (PATCH /deposits/amount): the manager tops up the deposit
 * on a transfer to a pricier room so it still covers a month's rent. The headline
 * case is the bug it fixes — a deposit recorded below the rent can't settle that
 * month's invoice (`applyToInvoice` requires full coverage), but bumping it lets
 * the apply through. Also covers create-if-missing, the floor at already-deducted,
 * and cross-tenant isolation.
 */
describe("Deposit amount adjustment (e2e)", () => {
  let h: Harness;
  let pgA: TestPg;
  let pgB: TestPg;

  const ROOM_RENT = 800000; // ₹8,000/mo
  const LOW_DEPOSIT = 700000; // ₹7,000 — short of a month's rent

  let r1Id: string; // has a too-low deposit
  let r1: string;
  let r2Id: string; // has no deposit at all

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
    pgA = await h.onboardPg("dep-upd-a");
    pgB = await h.onboardPg("dep-upd-b");
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
    // r1 gets a deposit short of a month's rent; r2 gets none.
    await h.req("post", "/deposits", mgr, {
      residentId: r1Id,
      amountPaise: LOW_DEPOSIT,
    });
    await h.req("post", "/invoices/generate", mgr, { period: "2026-06" });
  }, 30000);

  afterAll(async () => {
    await h?.close();
  });

  it("a deposit below the rent can't settle the invoice (the bug)", async () => {
    const inv = (await h.req("get", "/invoices/mine", r1)).body[0].id;
    const res = await h.req("post", "/deposits/apply-to-invoice", pgA.managerToken, {
      invoiceId: inv,
    });
    expect(res.status).toBe(409);
  });

  it("bumping the deposit to the new room's rent lets the apply through", async () => {
    const bump = await h.req("patch", "/deposits/amount", pgA.managerToken, {
      residentId: r1Id,
      amountPaise: ROOM_RENT,
    });
    expect(bump.status).toBe(200);
    expect(bump.body.amountPaise).toBe(ROOM_RENT);

    const dep = await h.req("get", `/deposits/resident/${r1Id}`, pgA.managerToken);
    expect(dep.body.deposit.status).toBe("HELD");
    expect(dep.body.deposit.amountPaise).toBe(ROOM_RENT);

    const inv = (await h.req("get", "/invoices/mine", r1)).body[0].id;
    const res = await h.req("post", "/deposits/apply-to-invoice", pgA.managerToken, {
      invoiceId: inv,
    });
    expect(res.status).toBe(201);
    expect(res.body.amountPaise).toBe(ROOM_RENT);
    expect(res.body.depositBalancePaise).toBe(0);
  });

  it("won't drop the deposit below what's already been applied (409)", async () => {
    // r1 has now had ROOM_RENT deducted; lowering below that would make the
    // available balance negative.
    const res = await h.req("patch", "/deposits/amount", pgA.managerToken, {
      residentId: r1Id,
      amountPaise: LOW_DEPOSIT,
    });
    expect(res.status).toBe(409);
  });

  it("creates a HELD deposit when the resident has none yet", async () => {
    const before = await h.req("get", `/deposits/resident/${r2Id}`, pgA.managerToken);
    expect(before.body.deposit).toBeNull();

    const res = await h.req("patch", "/deposits/amount", pgA.managerToken, {
      residentId: r2Id,
      amountPaise: ROOM_RENT,
    });
    expect(res.status).toBe(200);
    expect(res.body.amountPaise).toBe(ROOM_RENT);

    const after = await h.req("get", `/deposits/resident/${r2Id}`, pgA.managerToken);
    expect(after.body.deposit.status).toBe("HELD");
    expect(after.body.deposit.amountPaise).toBe(ROOM_RENT);
  });

  it("another tenant can't adjust this resident's deposit (404, RLS)", async () => {
    const res = await h.req("patch", "/deposits/amount", pgB.managerToken, {
      residentId: r1Id,
      amountPaise: 100000,
    });
    expect(res.status).toBe(404);
  });
});
