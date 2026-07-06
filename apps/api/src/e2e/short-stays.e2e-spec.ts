import { createHarness, randomPhone, type Harness, type TestPg } from "./harness";

/**
 * Short-stay e2e (resident-linked model). A short stay is a lightweight guest
 * resident (`isShortStay`) assigned to a bed from their profile; the terms come
 * from the resident record. Covers: assign on a VACANT bed (no booking) and on a
 * RESERVED bed (held until move-in), the never-allocated / never-metered
 * exclusion, eligible-beds filtering, complete/cancel → guest EXITED + bed freed,
 * the booking-cancel guard, activate-bookings skipping a TRANSIENT bed, date
 * validation, and cross-tenant isolation.
 */
describe("short-term stays (e2e)", () => {
  let h: Harness;
  let pgA: TestPg;
  let pgB: TestPg;
  let roomId: string;
  let bedReserved: string; // RESERVED (pending booking, move-in far in future)
  let bedVacant: string; // VACANT
  let bedOccupied: string; // OCCUPIED
  let bookingId: string;

  // IST-aware date helpers.
  const istNow = new Date(Date.now() + 330 * 60_000);
  const Y = istNow.getUTCFullYear();
  const M = istNow.getUTCMonth();
  const D = istNow.getUTCDate();
  const ymd = (y: number, m: number, d: number) =>
    new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
  const today = ymd(Y, M, D);
  const plus = (n: number) => ymd(Y, M, D + n);
  const checkout = plus(3);
  const bookingMoveIn = plus(40); // strictly after every guest's check-out

  async function id(res: {
    status: number;
    body: { id: string };
  }): Promise<string> {
    if (res.status !== 201 && res.status !== 200)
      throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.id;
  }

  async function bedStatus(bedId: string): Promise<string> {
    const res = await h.req(
      "get",
      `/property/beds?roomId=${roomId}`,
      pgA.managerToken,
    );
    return res.body.find((b: { id: string }) => b.id === bedId).status;
  }

  /** Register a short-stay guest resident with terms; returns the resident id. */
  async function registerGuest(fields: {
    checkIn?: string;
    checkOut: string;
    perDayPaise: number;
  }): Promise<string> {
    return id(
      await h.req("post", "/residents", pgA.managerToken, {
        name: "Short Guest",
        phone: randomPhone(),
        isShortStay: true,
        expectedMoveInDate: fields.checkIn ?? today,
        shortStayCheckOutDate: fields.checkOut,
        shortStayPerDayChargePaise: fields.perDayPaise,
      }),
    );
  }

  beforeAll(async () => {
    h = await createHarness();
    pgA = await h.onboardPg("ss-a");
    pgB = await h.onboardPg("ss-b");
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
        // Several tests add ad-hoc beds to this room (A/B/C + G1/G2/H/L/R/P),
        // so the capacity must clear the bed-count ceiling enforced by createBed.
        capacity: 12,
        monthlyRentPaise: 500000,
      }),
    );
    bedReserved = await id(
      await h.req("post", "/property/beds", mgr, { roomId, label: "A" }),
    );
    bedVacant = await id(
      await h.req("post", "/property/beds", mgr, { roomId, label: "B" }),
    );
    bedOccupied = await id(
      await h.req("post", "/property/beds", mgr, { roomId, label: "C" }),
    );

    // Reserve bedReserved via a future booking.
    const upcoming = await h.registerResident(mgr, {
      name: "Upcoming Resident",
      phone: randomPhone(),
    });
    bookingId = await id(
      await h.req("post", "/bookings", mgr, {
        residentId: upcoming,
        bedId: bedReserved,
        moveInDate: bookingMoveIn,
        depositAmountPaise: 0,
      }),
    );

    // Occupy bedOccupied with a live allocation.
    const current = await h.registerResident(mgr, {
      name: "Current Resident",
      phone: randomPhone(),
    });
    await h.req("post", "/allocations", mgr, {
      residentId: current,
      bedId: bedOccupied,
    });
  });

  afterAll(async () => h.close());

  // ── eligible beds ──────────────────────────────────────────────────────────

  it("eligible-beds for a short-stay guest: vacant + reserved-free-after, not occupied", async () => {
    const guest = await registerGuest({ checkOut: checkout, perDayPaise: 50000 });
    const res = await h.req(
      "get",
      `/allocations/eligible-beds?residentId=${guest}`,
      pgA.managerToken,
    );
    expect(res.status).toBe(200);
    const byId = new Map(
      res.body.map((b: { bedId: string; kind: string }) => [b.bedId, b.kind]),
    );
    expect(byId.get(bedVacant)).toBe("VACANT");
    expect(byId.get(bedReserved)).toBe("RESERVED_FREE_AFTER");
    expect(byId.has(bedOccupied)).toBe(false);
    // Reserved-free-after beds are emitted before vacant ones so a short stay
    // fills idle reserved capacity first, leaving vacant beds for long-term use.
    const kinds = res.body.map((b: { kind: string }) => b.kind);
    expect(kinds.indexOf("RESERVED_FREE_AFTER")).toBeLessThan(
      kinds.indexOf("VACANT"),
    );
  });

  it("eligible-beds for a long-term resident: vacant + leaving-soon before move-in", async () => {
    const mgr = pgA.managerToken;
    // An occupied bed whose sitting resident has requested an exit before the
    // incoming resident's move-in date.
    const sitterPhone = randomPhone();
    const sitter = await h.registerResident(mgr, {
      name: "Sitter",
      phone: sitterPhone,
    });
    const leavingBed = await id(
      await h.req("post", "/property/beds", mgr, { roomId, label: "L" }),
    );
    await h.req("post", "/allocations", mgr, {
      residentId: sitter,
      bedId: leavingBed,
    });
    const sitterToken = await h.residentLogin(pgA.slug, pgA.id, sitterPhone);
    const reqRes = await h.req(
      "post",
      "/deposits/exit-request",
      sitterToken,
      { requestedDate: plus(10) },
    );
    expect(reqRes.status).toBe(201);

    const incoming = await h.registerResident(mgr, {
      name: "Incoming",
      phone: randomPhone(),
      expectedMoveInDate: plus(30),
    });
    const res = await h.req(
      "get",
      `/allocations/eligible-beds?residentId=${incoming}`,
      mgr,
    );
    expect(res.status).toBe(200);
    const row = res.body.find(
      (b: { bedId: string }) => b.bedId === leavingBed,
    );
    expect(row?.kind).toBe("LEAVING_SOON");
    expect(row?.freesOnDate).toBe(plus(10));
    expect(
      res.body.some((b: { kind: string }) => b.kind === "VACANT"),
    ).toBe(true);

    // Every eligible bed carries the room-fit fields the assign dialog filters
    // and sorts on: the room's occupation preference, sharing capacity, and the
    // count of beds still free in that room.
    const vacantRow = res.body.find(
      (b: { kind: string }) => b.kind === "VACANT",
    );
    expect(typeof vacantRow.capacity).toBe("number");
    expect("occupationPreference" in vacantRow).toBe(true);
    expect(typeof vacantRow.bedsRemaining).toBe("number");
    expect(vacantRow.bedsRemaining).toBeGreaterThanOrEqual(1);
  });

  // ── assign on a VACANT bed ─────────────────────────────────────────────────

  it("assigns a guest to a VACANT bed → TRANSIENT, no booking, fee = days × per-day", async () => {
    const guest = await registerGuest({ checkOut: checkout, perDayPaise: 50000 });
    const res = await h.req("post", "/short-stays", pgA.managerToken, {
      residentId: guest,
      bedId: bedVacant,
    });
    expect(res.status).toBe(201);
    expect(await bedStatus(bedVacant)).toBe("TRANSIENT");

    const list = await h.req("get", "/short-stays", pgA.managerToken);
    const stay = list.body.find(
      (s: { residentId: string }) => s.residentId === guest,
    );
    expect(stay.bedId).toBe(bedVacant);
    expect(stay.bookingId).toBeNull();
    expect(stay.feePaise).toBe(3 * 50000); // today → +3 days
    expect(stay.perDayChargePaise).toBe(50000);

    // Exclusion: a short-stay guest never gets an allocation, so it can't be
    // billed or metered.
    const allocs = await h.req("get", "/allocations", pgA.managerToken);
    expect(
      allocs.body.some((a: { residentId: string }) => a.residentId === guest),
    ).toBe(false);
  });

  it("rejects a second active stay for the same guest → 409", async () => {
    const guest = await registerGuest({ checkOut: checkout, perDayPaise: 1000 });
    const first = await h.req("post", "/short-stays", pgA.managerToken, {
      residentId: guest,
      bedId: await id(
        await h.req("post", "/property/beds", pgA.managerToken, {
          roomId,
          label: "G1",
        }),
      ),
    });
    expect(first.status).toBe(201);
    const second = await h.req("post", "/short-stays", pgA.managerToken, {
      residentId: guest,
      bedId: await id(
        await h.req("post", "/property/beds", pgA.managerToken, {
          roomId,
          label: "G2",
        }),
      ),
    });
    expect(second.status).toBe(409);
  });

  it("completing a vacant-bed stay frees the bed to VACANT and exits the guest", async () => {
    const guest = await registerGuest({ checkOut: checkout, perDayPaise: 1000 });
    const bed = await id(
      await h.req("post", "/property/beds", pgA.managerToken, {
        roomId,
        label: "H",
      }),
    );
    const stayId = await id(
      await h.req("post", "/short-stays", pgA.managerToken, {
        residentId: guest,
        bedId: bed,
      }),
    );
    const res = await h.req(
      "post",
      `/short-stays/${stayId}/complete`,
      pgA.managerToken,
    );
    expect(res.status).toBe(201);
    expect(await bedStatus(bed)).toBe("VACANT");
    const r = await h.req("get", `/residents/${guest}`, pgA.managerToken);
    expect(r.body.status).toBe("EXITED");
  });

  // ── assign on a RESERVED bed ───────────────────────────────────────────────

  it("assigns a guest to a RESERVED bed (check-out before move-in) → TRANSIENT, booking attached", async () => {
    const guest = await registerGuest({ checkOut: checkout, perDayPaise: 2000 });
    const res = await h.req("post", "/short-stays", pgA.managerToken, {
      residentId: guest,
      bedId: bedReserved,
    });
    expect(res.status).toBe(201);
    expect(await bedStatus(bedReserved)).toBe("TRANSIENT");
    const list = await h.req("get", "/short-stays", pgA.managerToken);
    const stay = list.body.find(
      (s: { residentId: string }) => s.residentId === guest,
    );
    expect(stay.bookingId).toBe(bookingId);
  });

  it("activate-bookings skips a TRANSIENT bed — booking stays PENDING", async () => {
    const res = await h.req(
      "post",
      "/platform/jobs/activate-bookings",
      h.platformToken(),
    );
    expect(res.status).toBe(201);
    const bookings = await h.req("get", "/bookings", pgA.managerToken);
    const booking = bookings.body.find(
      (b: { id: string }) => b.id === bookingId,
    );
    expect(booking.status).toBe("PENDING");
    expect(await bedStatus(bedReserved)).toBe("TRANSIENT");
  });

  it("cancelling the booking while the short stay is ACTIVE → 409", async () => {
    const res = await h.req(
      "post",
      `/bookings/${bookingId}/cancel`,
      pgA.managerToken,
    );
    expect(res.status).toBe(409);
  });

  it("completing the reserved-bed stay returns the bed to RESERVED and exits the guest", async () => {
    const list = await h.req("get", "/short-stays", pgA.managerToken);
    const stay = list.body.find(
      (s: { bedId: string; status: string }) =>
        s.bedId === bedReserved && s.status === "ACTIVE",
    );
    const res = await h.req(
      "post",
      `/short-stays/${stay.id}/complete`,
      pgA.managerToken,
    );
    expect(res.status).toBe(201);
    expect(await bedStatus(bedReserved)).toBe("RESERVED");
    const r = await h.req(
      "get",
      `/residents/${stay.residentId}`,
      pgA.managerToken,
    );
    expect(r.body.status).toBe("EXITED");

    // With no active stay the booking can be cancelled → bed frees to VACANT.
    const cancel = await h.req(
      "post",
      `/bookings/${bookingId}/cancel`,
      pgA.managerToken,
    );
    expect(cancel.status).toBe(201);
    expect(await bedStatus(bedReserved)).toBe("VACANT");
  });

  // ── validation ─────────────────────────────────────────────────────────────

  it("rejects a stay whose check-out is on/after the booking's move-in → 422", async () => {
    const resident = await h.registerResident(pgA.managerToken, {
      name: "Booker",
      phone: randomPhone(),
    });
    const bed = await id(
      await h.req("post", "/property/beds", pgA.managerToken, {
        roomId,
        label: "R",
      }),
    );
    await h.req("post", "/bookings", pgA.managerToken, {
      residentId: resident,
      bedId: bed,
      moveInDate: bookingMoveIn,
      depositAmountPaise: 0,
    });
    // Guest checks out AFTER the booking move-in — not allowed on a reserved bed.
    const guest = await registerGuest({ checkOut: plus(50), perDayPaise: 1000 });
    const res = await h.req("post", "/short-stays", pgA.managerToken, {
      residentId: guest,
      bedId: bed,
    });
    expect(res.status).toBe(422);
  });

  it("rejects a stay whose check-in is in the past → 400", async () => {
    const guest = await registerGuest({
      checkIn: plus(-1),
      checkOut: today,
      perDayPaise: 1000,
    });
    const bed = await id(
      await h.req("post", "/property/beds", pgA.managerToken, {
        roomId,
        label: "P",
      }),
    );
    const res = await h.req("post", "/short-stays", pgA.managerToken, {
      residentId: guest,
      bedId: bed,
    });
    expect(res.status).toBe(400);
  });

  // ── cross-tenant isolation ─────────────────────────────────────────────────

  it("PG B cannot see PG A short stays", async () => {
    const res = await h.req("get", "/short-stays", pgB.managerToken);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it("PG B cannot assign a stay onto a PG A bed", async () => {
    const guest = await h.registerResident(pgB.managerToken, {
      name: "B Guest",
      phone: randomPhone(),
    });
    const res = await h.req("post", "/short-stays", pgB.managerToken, {
      residentId: guest,
      bedId: bedVacant, // PG A's bed — invisible under PG B's RLS
    });
    expect([404, 409]).toContain(res.status);
  });
});
