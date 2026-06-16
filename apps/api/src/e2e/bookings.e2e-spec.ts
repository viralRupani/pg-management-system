import { createHarness, randomPhone, type Harness, type TestPg } from "./harness";

/**
 * Future-dated bed booking e2e. A manager holds a bed for an incoming resident
 * and takes the deposit before move-in; the bed shows as held (not a live
 * allocation), no rent is billed and the resident isn't metered until a daily
 * job activates the booking on/after the move-in date. Covers: vacant-bed hold +
 * UPCOMING resident + HELD deposit + not-suggested + not-billed, double-book
 * 409, cancel (true undo), activation creating a prorated current-period
 * invoice, an occupied-bed booking that stays held through the sitting
 * resident's exit (bed → RESERVED) then activates, past-date rejection, and
 * cross-tenant invisibility.
 */
describe("future-dated bed booking (e2e)", () => {
  let h: Harness;
  let pgA: TestPg;
  let pgB: TestPg;
  let roomId: string;
  let bedV: string; // vacant → booked then cancelled
  let bedBill: string; // vacant → booked today then activated + billed
  let bedOcc: string; // occupied → booked then freed-to-RESERVED then activated
  let bedMove: string; // occupied → booked then freed via plain move-out
  let residentVac: string;
  let residentDouble: string;
  let residentBill: string;
  let residentSitting: string;
  let residentIncoming: string;
  let residentMoving: string;
  let residentMoveIn: string;

  // IST-aware "today" and "first of next month" (the API validates and prorates
  // in IST; IST runs ahead of UTC so these never trip the today-or-future rule).
  const istNow = new Date(Date.now() + 330 * 60_000);
  const today = istNow.toISOString().slice(0, 10);
  const period = istNow.toISOString().slice(0, 7); // 'YYYY-MM'
  const nextMonthFirst = new Date(
    Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth() + 1, 1),
  )
    .toISOString()
    .slice(0, 10);
  const RENT = 800000;

  async function id(res: {
    status: number;
    body: { id: string };
  }): Promise<string> {
    if (res.status !== 201 && res.status !== 200)
      throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.id;
  }

  async function bedStatus(bedId: string): Promise<string> {
    const res = await h.req("get", `/property/beds?roomId=${roomId}`, pgA.managerToken);
    return res.body.find((b: { id: string }) => b.id === bedId).status;
  }

  async function residentStatus(residentId: string): Promise<string> {
    const res = await h.req("get", `/residents/${residentId}`, pgA.managerToken);
    return res.body.status;
  }

  beforeAll(async () => {
    h = await createHarness();
    pgA = await h.onboardPg("book-a");
    pgB = await h.onboardPg("book-b");
    const mgr = pgA.managerToken;

    const buildingId = await id(
      await h.req("post", "/property/buildings", mgr, { name: "Block A" }),
    );
    const floorId = await id(
      await h.req("post", "/property/floors", mgr, { buildingId, label: "G" }),
    );
    roomId = await id(
      await h.req("post", "/property/rooms", mgr, {
        floorId,
        label: "101",
        capacity: 4,
        monthlyRentPaise: RENT,
      }),
    );
    bedV = await id(await h.req("post", "/property/beds", mgr, { roomId, label: "V" }));
    bedBill = await id(await h.req("post", "/property/beds", mgr, { roomId, label: "Bill" }));
    bedOcc = await id(await h.req("post", "/property/beds", mgr, { roomId, label: "Occ" }));
    bedMove = await id(await h.req("post", "/property/beds", mgr, { roomId, label: "Move" }));

    residentVac = await h.registerResident(mgr, { name: "Vac Joiner", phone: randomPhone() });
    residentDouble = await h.registerResident(mgr, { name: "Double Booker", phone: randomPhone() });
    residentBill = await h.registerResident(mgr, { name: "Bill Joiner", phone: randomPhone() });
    residentSitting = await h.registerResident(mgr, { name: "Sitting Tenant", phone: randomPhone() });
    residentIncoming = await h.registerResident(mgr, { name: "Incoming Tenant", phone: randomPhone() });
    residentMoving = await h.registerResident(mgr, { name: "Moving Out", phone: randomPhone() });
    residentMoveIn = await h.registerResident(mgr, { name: "Moving In", phone: randomPhone() });
  }, 30000);

  afterAll(async () => {
    await h?.close();
  });

  it("books a vacant bed: bed RESERVED, resident UPCOMING, deposit HELD", async () => {
    const res = await h.req("post", "/bookings", pgA.managerToken, {
      residentId: residentVac,
      bedId: bedV,
      moveInDate: nextMonthFirst,
      depositAmountPaise: 1500000,
    });
    expect(res.status).toBe(201);

    expect(await bedStatus(bedV)).toBe("RESERVED");
    expect(await residentStatus(residentVac)).toBe("UPCOMING");

    const dep = await h.req("get", `/deposits/resident/${residentVac}`, pgA.managerToken);
    expect(dep.body.deposit).toMatchObject({ amountPaise: 1500000, status: "HELD" });
  });

  it("roster filters: CURRENT shows upcoming, ACTIVE hides it, UPCOMING shows held bed", async () => {
    const ids = async (status: string) => {
      const res = await h.req("get", `/residents?status=${status}`, pgA.managerToken);
      return res.body.items as Array<{
        id: string;
        status: string;
        bookedBedLabel: string | null;
        moveInDate: string | null;
      }>;
    };

    // CURRENT = active + upcoming: the upcoming joiner shows up...
    const current = await ids("CURRENT");
    const vac = current.find((r) => r.id === residentVac);
    expect(vac?.status).toBe("UPCOMING");
    expect(current.some((r) => r.id === residentDouble)).toBe(true); // a live ACTIVE one too

    // ...but strict ACTIVE hides the upcoming resident (the booking picker relies on this).
    const active = await ids("ACTIVE");
    expect(active.some((r) => r.id === residentVac)).toBe(false);
    expect(active.some((r) => r.id === residentDouble)).toBe(true);

    // UPCOMING isolates them and surfaces the held bed + move-in date.
    const upcoming = await ids("UPCOMING");
    const onlyVac = upcoming.find((r) => r.id === residentVac);
    expect(onlyVac).toMatchObject({ bookedBedLabel: "V" });
    expect(onlyVac?.moveInDate).toBeTruthy();
    expect(upcoming.some((r) => r.id === residentDouble)).toBe(false);
  });

  it("does not make the booked resident a live allocation", async () => {
    const active = await h.req("get", "/allocations", pgA.managerToken);
    expect(active.body.map((a: { residentId: string }) => a.residentId)).not.toContain(
      residentVac,
    );
  });

  it("excludes a held (RESERVED) bed from placement suggestions", async () => {
    const res = await h.req(
      "get",
      `/allocations/suggestions?residentId=${residentDouble}`,
      pgA.managerToken,
    );
    expect(res.body.map((b: { bedId: string }) => b.bedId)).not.toContain(bedV);
  });

  it("does not bill a future-dated booking in the current period", async () => {
    await h.req("post", "/invoices/generate", pgA.managerToken, { period });
    const all = await h.req("get", "/invoices", pgA.managerToken);
    const items = all.body.items ?? all.body;
    expect(items.find((i: { residentId: string }) => i.residentId === residentVac)).toBeUndefined();
  });

  it("rejects double-booking the same bed (409)", async () => {
    const res = await h.req("post", "/bookings", pgA.managerToken, {
      residentId: residentDouble,
      bedId: bedV,
      moveInDate: nextMonthFirst,
      depositAmountPaise: 1000000,
    });
    expect(res.status).toBe(409);
  });

  it("rejects a past move-in date (400)", async () => {
    const res = await h.req("post", "/bookings", pgA.managerToken, {
      residentId: residentDouble,
      bedId: bedBill,
      moveInDate: "2020-01-01",
      depositAmountPaise: 1000000,
    });
    expect(res.status).toBe(400);
  });

  it("cancel is a true undo: bed VACANT, resident ACTIVE, deposit removed", async () => {
    const list = await h.req("get", "/bookings", pgA.managerToken);
    const booking = list.body.find(
      (b: { residentId: string; status: string }) =>
        b.residentId === residentVac && b.status === "PENDING",
    );
    const res = await h.req("post", `/bookings/${booking.id}/cancel`, pgA.managerToken);
    expect(res.status).toBe(201);

    expect(await bedStatus(bedV)).toBe("VACANT");
    expect(await residentStatus(residentVac)).toBe("ACTIVE");
    const dep = await h.req("get", `/deposits/resident/${residentVac}`, pgA.managerToken);
    expect(dep.body.deposit).toBeNull();
  });

  it("activates a due booking → allocation, OCCUPIED bed, ACTIVE resident, prorated bill", async () => {
    const booked = await h.req("post", "/bookings", pgA.managerToken, {
      residentId: residentBill,
      bedId: bedBill,
      moveInDate: today,
      depositAmountPaise: 2000000,
    });
    expect(booked.status).toBe(201);

    const run = await h.req("post", "/platform/jobs/activate-bookings", h.platformToken());
    expect(run.status).toBe(201);

    expect(await bedStatus(bedBill)).toBe("OCCUPIED");
    expect(await residentStatus(residentBill)).toBe("ACTIVE");

    const active = await h.req("get", "/allocations", pgA.managerToken);
    expect(active.body.map((a: { residentId: string }) => a.residentId)).toContain(residentBill);

    const list = await h.req("get", "/bookings", pgA.managerToken);
    expect(
      list.body.find((b: { residentId: string }) => b.residentId === residentBill).status,
    ).toBe("ACTIVATED");

    // Billed from move-in: a prorated current-period invoice now exists.
    await h.req("post", "/invoices/generate", pgA.managerToken, { period });
    const all = await h.req("get", "/invoices", pgA.managerToken);
    const items = all.body.items ?? all.body;
    const inv = items.find((i: { residentId: string }) => i.residentId === residentBill);
    expect(inv).toBeDefined();
    expect(inv.amountPaise).toBeGreaterThan(0);
    expect(inv.amountPaise).toBeLessThanOrEqual(RENT);
  });

  it("holds an occupied bed through the sitting resident's exit, then activates", async () => {
    // Sitting resident occupies the bed.
    await h.req("post", "/allocations", pgA.managerToken, {
      bedId: bedOcc,
      residentId: residentSitting,
    });
    expect(await bedStatus(bedOcc)).toBe("OCCUPIED");

    // Incoming resident books the still-occupied bed, due today.
    const booked = await h.req("post", "/bookings", pgA.managerToken, {
      residentId: residentIncoming,
      bedId: bedOcc,
      moveInDate: today,
      depositAmountPaise: 1800000,
    });
    expect(booked.status).toBe(201);
    expect(await bedStatus(bedOcc)).toBe("OCCUPIED"); // sitting resident still there

    // Activation skips it while the bed is still occupied.
    await h.req("post", "/platform/jobs/activate-bookings", h.platformToken());
    expect(await residentStatus(residentIncoming)).toBe("UPCOMING");

    // Sitting resident exits → bed is held (RESERVED) for the incoming resident.
    const exit = await h.req("post", "/deposits/exit", pgA.managerToken, {
      residentId: residentSitting,
      deductions: [],
    });
    expect(exit.status).toBe(201);
    expect(await bedStatus(bedOcc)).toBe("RESERVED");

    // Next activation run promotes the booking to a live allocation.
    await h.req("post", "/platform/jobs/activate-bookings", h.platformToken());
    expect(await bedStatus(bedOcc)).toBe("OCCUPIED");
    expect(await residentStatus(residentIncoming)).toBe("ACTIVE");
    const active = await h.req("get", "/allocations", pgA.managerToken);
    expect(active.body.map((a: { residentId: string }) => a.residentId)).toContain(residentIncoming);
  });

  it("plain move-out of a booked bed also holds it (RESERVED), then activates", async () => {
    // Sitting resident occupies the bed; incoming resident books it, due today.
    await h.req("post", "/allocations", pgA.managerToken, {
      bedId: bedMove,
      residentId: residentMoving,
    });
    const booked = await h.req("post", "/bookings", pgA.managerToken, {
      residentId: residentMoveIn,
      bedId: bedMove,
      moveInDate: today,
      depositAmountPaise: 1200000,
    });
    expect(booked.status).toBe(201);

    // Vacate via plain move-out (NOT deposit settlement) — the other vacate path.
    const out = await h.req("post", "/allocations/move-out", pgA.managerToken, {
      residentId: residentMoving,
    });
    expect(out.status).toBe(201);
    expect(await bedStatus(bedMove)).toBe("RESERVED"); // held, not VACANT

    await h.req("post", "/platform/jobs/activate-bookings", h.platformToken());
    expect(await bedStatus(bedMove)).toBe("OCCUPIED");
    expect(await residentStatus(residentMoveIn)).toBe("ACTIVE");
  });

  it("cross-tenant: PG B sees no PG A bookings and cannot book PG A's bed", async () => {
    const list = await h.req("get", "/bookings", pgB.managerToken);
    expect(list.body).toHaveLength(0);

    const res = await h.req("post", "/bookings", pgB.managerToken, {
      residentId: residentDouble,
      bedId: bedBill,
      moveInDate: nextMonthFirst,
      depositAmountPaise: 1000000,
    });
    expect(res.status).toBe(404); // PG A's resident/bed invisible under PG B's RLS
  });
});
