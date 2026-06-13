import { createHarness, randomPhone, type Harness, type TestPg } from "./harness";

/**
 * Room-transfer e2e: a manager pre-books a move (soft-hold transfer request),
 * executes it on the move day (old allocation ends, new one starts, beds flip),
 * and the mid-month rent delta is queued as a SIGNED adjustment that the next
 * invoice consumes. Covers the credit direction (cheaper room → resident owed
 * money back), the one-PENDING-per-resident guard, the occupied-target 409, and
 * cross-tenant invisibility.
 *
 * Rents are divisible by 30 so June (30 days) proration lands on exact integers.
 */
async function newId(res: {
  status: number;
  body: { id: string };
}): Promise<string> {
  if (res.status !== 201 && res.status !== 200)
    throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.id;
}

describe("Room transfers (e2e)", () => {
  let h: Harness;
  let pgA: TestPg;
  let pgB: TestPg;

  const RENT_A = 900000; // ₹9000 old room
  const RENT_B = 600000; // ₹6000 new room (cheaper → credit)

  let bedA1: string; // old room bed (resident1)
  let bedB1: string; // new room target
  let resident1: string;
  let resident2: string; // used to occupy the target for the 409 test
  let requestId: string;

  beforeAll(async () => {
    h = await createHarness();
    pgA = await h.onboardPg("xfer-a");
    pgB = await h.onboardPg("xfer-b");
    const mgr = pgA.managerToken;

    const buildingId = await newId(
      await h.req("post", "/property/buildings", mgr, { name: "Block X" }),
    );
    const floorId = await newId(
      await h.req("post", "/property/floors", mgr, { buildingId, label: "G" }),
    );
    const roomA = await newId(
      await h.req("post", "/property/rooms", mgr, {
        floorId,
        label: "A",
        capacity: 1,
        monthlyRentPaise: RENT_A,
      }),
    );
    const roomB = await newId(
      await h.req("post", "/property/rooms", mgr, {
        floorId,
        label: "B",
        capacity: 1,
        monthlyRentPaise: RENT_B,
      }),
    );
    bedA1 = await newId(await h.req("post", "/property/beds", mgr, { roomId: roomA, label: "A1" }));
    bedB1 = await newId(await h.req("post", "/property/beds", mgr, { roomId: roomB, label: "B1" }));

    resident1 = await h.registerResident(mgr, { name: "Mover One", phone: randomPhone() });
    resident2 = await h.registerResident(mgr, { name: "Occupier Two", phone: randomPhone() });

    // Resident1 lives in the expensive room from the 1st → full June rent.
    await h.req("post", "/allocations", mgr, {
      bedId: bedA1,
      residentId: resident1,
      startDate: "2026-06-01",
    });
  }, 30000);

  afterAll(async () => {
    await h?.close();
  });

  it("generates the full-month June invoice for the old room", async () => {
    const gen = await h.req("post", "/invoices/generate", pgA.managerToken, {
      period: "2026-06",
    });
    expect(gen.status).toBe(201);
    const all = await h.req("get", "/invoices", pgA.managerToken);
    const june = all.body.items.find(
      (i: { residentId: string; period: string }) =>
        i.residentId === resident1 && i.period === "2026-06",
    );
    expect(june.amountPaise).toBe(RENT_A);
  });

  it("books a transfer request (soft hold — bed not locked)", async () => {
    const res = await h.req("post", "/allocations/transfers", pgA.managerToken, {
      residentId: resident1,
      toBedId: bedB1,
      plannedDate: "2026-06-15",
    });
    expect(res.status).toBe(201);
    requestId = res.body.id;

    const list = await h.req("get", "/allocations/transfers", pgA.managerToken);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      residentId: resident1,
      fromBedLabel: "A1",
      toBedLabel: "B1",
      status: "PENDING",
    });
  });

  it("rejects a second pending request for the same resident (409)", async () => {
    const res = await h.req("post", "/allocations/transfers", pgA.managerToken, {
      residentId: resident1,
      toBedId: bedB1,
      plannedDate: "2026-06-20",
    });
    expect(res.status).toBe(409);
  });

  it("cross-tenant: PG B cannot see or execute PG A's transfer request", async () => {
    const list = await h.req("get", "/allocations/transfers", pgB.managerToken);
    expect(list.body).toHaveLength(0);

    const exec = await h.req(
      "post",
      `/allocations/transfers/${requestId}/execute`,
      pgB.managerToken,
      {},
    );
    expect(exec.status).toBe(404);
  });

  it("execution onto an occupied target bed is rejected (409), request stays PENDING", async () => {
    // Occupy the target so the soft hold's re-check bites.
    await h.req("post", "/allocations", pgA.managerToken, {
      bedId: bedB1,
      residentId: resident2,
      startDate: "2026-06-01",
    });

    const exec = await h.req(
      "post",
      `/allocations/transfers/${requestId}/execute`,
      pgA.managerToken,
      { moveDate: "2026-06-15" },
    );
    expect(exec.status).toBe(409);

    // The completion flip rolled back with the failed move → still PENDING.
    const list = await h.req("get", "/allocations/transfers", pgA.managerToken);
    expect(list.body[0].status).toBe("PENDING");

    // Free the target again for the happy path.
    await h.req("post", "/allocations/move-out", pgA.managerToken, {
      residentId: resident2,
    });
  });

  it("executes the move: old allocation ends, new one is active, beds flip", async () => {
    const exec = await h.req(
      "post",
      `/allocations/transfers/${requestId}/execute`,
      pgA.managerToken,
      { moveDate: "2026-06-15" },
    );
    expect(exec.status).toBe(201);

    const active = await h.req("get", "/allocations", pgA.managerToken);
    expect(active.body).toHaveLength(1);
    expect(active.body[0]).toMatchObject({
      bedId: bedB1,
      residentId: resident1,
      endDate: null,
    });

    const list = await h.req("get", "/allocations/transfers", pgA.managerToken);
    expect(list.body[0].status).toBe("COMPLETED");
    expect(list.body[0].completedAt).not.toBeNull();
  });

  it("refuses a second transfer while the first is unsettled (avoids compounding the delta)", async () => {
    // resident1's transfer delta is still unapplied (July not generated yet). A
    // second move now would net against a stale baseline → blocked at booking.
    const res = await h.req("post", "/allocations/transfers", pgA.managerToken, {
      residentId: resident1,
      toBedId: bedA1, // vacated by the move — but the guard fires before that matters
      plannedDate: "2026-06-25",
    });
    expect(res.status).toBe(409);
  });

  it("leaves June untouched and nets the prorated credit into July", async () => {
    // June stays full old-room (already billed on the 1st, possibly paid).
    const before = await h.req("get", "/invoices", pgA.managerToken);
    const june = before.body.items.find(
      (i: { residentId: string; period: string }) =>
        i.residentId === resident1 && i.period === "2026-06",
    );
    expect(june.amountPaise).toBe(RENT_A);

    // July: base = full new room; minus the transfer delta.
    //   old days 1..14 @9000/30 = 420000 ; new days 15..30 @6000/30 = 320000
    //   correct June = 740000 ; billed June = 900000 ; delta = -160000 (credit)
    //   July = 600000 - 160000 = 440000
    const gen = await h.req("post", "/invoices/generate", pgA.managerToken, {
      period: "2026-07",
    });
    expect(gen.status).toBe(201);

    const all = await h.req("get", "/invoices", pgA.managerToken);
    const july = all.body.items.find(
      (i: { residentId: string; period: string }) =>
        i.residentId === resident1 && i.period === "2026-07",
    );
    expect(july.amountPaise).toBe(440000);
    expect(july.status).toBe("PENDING");
  });

  it("re-running July generation does not re-apply the adjustment", async () => {
    const again = await h.req("post", "/invoices/generate", pgA.managerToken, {
      period: "2026-07",
    });
    expect(again.body.generated).toBe(0);
    const all = await h.req("get", "/invoices", pgA.managerToken);
    const july = all.body.items.find(
      (i: { residentId: string; period: string }) =>
        i.residentId === resident1 && i.period === "2026-07",
    );
    expect(july.amountPaise).toBe(440000); // unchanged
  });
});

/**
 * Credit overflow: when a resident moves from an expensive room to a much cheaper
 * one early in the month (already billed full), the credit can exceed the next
 * month's base. The invoice settles at 0 (PAID) and the leftover credit carries
 * forward to the month after. Own PG so counts stay clean.
 */
describe("Room transfer credit carry-forward (e2e)", () => {
  let h: Harness;
  let pg: TestPg;
  const RENT_HI = 900000; // ₹9000
  const RENT_LO = 300000; // ₹3000

  let resident: string;
  let bedHi: string;
  let bedLo: string;

  beforeAll(async () => {
    h = await createHarness();
    pg = await h.onboardPg("xfer-credit");
    const mgr = pg.managerToken;

    const buildingId = await newId(
      await h.req("post", "/property/buildings", mgr, { name: "Block Y" }),
    );
    const floorId = await newId(
      await h.req("post", "/property/floors", mgr, { buildingId, label: "G" }),
    );
    const roomHi = await newId(
      await h.req("post", "/property/rooms", mgr, {
        floorId,
        label: "HI",
        capacity: 1,
        monthlyRentPaise: RENT_HI,
      }),
    );
    const roomLo = await newId(
      await h.req("post", "/property/rooms", mgr, {
        floorId,
        label: "LO",
        capacity: 1,
        monthlyRentPaise: RENT_LO,
      }),
    );
    bedHi = await newId(await h.req("post", "/property/beds", mgr, { roomId: roomHi, label: "H1" }));
    bedLo = await newId(await h.req("post", "/property/beds", mgr, { roomId: roomLo, label: "L1" }));

    resident = await h.registerResident(mgr, { name: "Early Mover", phone: randomPhone() });
    await h.req("post", "/allocations", mgr, {
      bedId: bedHi,
      residentId: resident,
      startDate: "2026-06-01",
    });
    await h.req("post", "/invoices/generate", mgr, { period: "2026-06" });
  }, 30000);

  afterAll(async () => {
    await h?.close();
  });

  it("a large credit zeroes July and carries the remainder into August", async () => {
    const mgr = pg.managerToken;

    const reqId = await newId(
      await h.req("post", "/allocations/transfers", mgr, {
        residentId: resident,
        toBedId: bedLo,
        plannedDate: "2026-06-03",
      }),
    );
    const exec = await h.req(
      "post",
      `/allocations/transfers/${reqId}/execute`,
      mgr,
      { moveDate: "2026-06-03" },
    );
    expect(exec.status).toBe(201);

    // delta: old days 1..2 @9000/30 = 60000 ; new days 3..30 @3000/30 = 280000
    //   correct June = 340000 ; billed = 900000 ; delta = -560000
    // July base 300000 - 560000 = -260000 → invoice settles 0/PAID, carry -260000.
    await h.req("post", "/invoices/generate", mgr, { period: "2026-07" });
    let all = await h.req("get", "/invoices", mgr);
    const july = all.body.items.find(
      (i: { period: string }) => i.period === "2026-07",
    );
    expect(july.amountPaise).toBe(0);
    expect(july.status).toBe("PAID");

    // August base 300000 - leftover 260000 = 40000.
    await h.req("post", "/invoices/generate", mgr, { period: "2026-08" });
    all = await h.req("get", "/invoices", mgr);
    const august = all.body.items.find(
      (i: { period: string }) => i.period === "2026-08",
    );
    expect(august.amountPaise).toBe(40000);
    expect(august.status).toBe("PENDING");
  });
});
