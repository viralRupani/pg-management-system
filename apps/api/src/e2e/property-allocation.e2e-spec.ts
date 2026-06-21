import { createHarness, randomPhone, type Harness, type TestPg } from "./harness";

/**
 * M2 property + allocation e2e: build a building→floor→room→bed chain, allocate,
 * prove the double-booking backstop (one active allocation per bed AND per
 * resident → 409), move-out frees the bed, and cross-tenant references are
 * invisible (a manager cannot allocate another PG's bed/resident).
 */
describe("M2 property & allocation (e2e)", () => {
  let h: Harness;
  let pgA: TestPg;
  let pgB: TestPg;
  let buildingId: string;
  let floorId: string;
  let roomId: string;
  let bed1: string;
  let bed2: string;
  let resident1: string;
  let resident2: string;

  async function id(res: { status: number; body: { id: string } }): Promise<string> {
    if (res.status !== 201 && res.status !== 200) {
      throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.id;
  }

  beforeAll(async () => {
    h = await createHarness();
    pgA = await h.onboardPg("prop-a");
    pgB = await h.onboardPg("prop-b");
    const mgr = pgA.managerToken;

    buildingId = await id(
      await h.req("post", "/property/buildings", mgr, { name: "Block A" }),
    );
    floorId = await id(
      await h.req("post", "/property/floors", mgr, { buildingId, label: "G" }),
    );
    roomId = await id(
      await h.req("post", "/property/rooms", mgr, {
        floorId,
        label: "101",
        capacity: 2,
        monthlyRentPaise: 800000,
      }),
    );
    bed1 = await id(await h.req("post", "/property/beds", mgr, { roomId, label: "A" }));
    bed2 = await id(await h.req("post", "/property/beds", mgr, { roomId, label: "B" }));

    resident1 = await h.registerResident(mgr, { name: "Res One", phone: randomPhone() });
    resident2 = await h.registerResident(mgr, { name: "Res Two", phone: randomPhone() });
  }, 30000);

  afterAll(async () => {
    await h?.close();
  });

  it("lists the created property chain", async () => {
    const beds = await h.req("get", `/property/beds?roomId=${roomId}`, pgA.managerToken);
    expect(beds.status).toBe(200);
    expect(beds.body.map((b: { id: string }) => b.id).sort()).toEqual([bed1, bed2].sort());
  });

  it("edits room rent (feeds the rent loop)", async () => {
    const patch = await h.req("patch", `/property/rooms/${roomId}/rent`, pgA.managerToken, {
      monthlyRentPaise: 950000,
    });
    expect(patch.status).toBe(200);
    const rooms = await h.req("get", "/property/rooms", pgA.managerToken);
    const room = rooms.body.find((r: { id: string }) => r.id === roomId);
    expect(room.monthlyRentPaise).toBe(950000);
  });

  it("renames a building, floor, room, and bed (pure relabel)", async () => {
    const mgr = pgA.managerToken;
    expect((await h.req("patch", `/property/buildings/${buildingId}`, mgr, { name: "Block A (renamed)" })).status).toBe(200);
    expect((await h.req("patch", `/property/floors/${floorId}`, mgr, { label: "Ground" })).status).toBe(200);
    expect((await h.req("patch", `/property/rooms/${roomId}`, mgr, { label: "101A" })).status).toBe(200);
    expect((await h.req("patch", `/property/beds/${bed2}`, mgr, { label: "B2" })).status).toBe(200);

    const buildings = await h.req("get", "/property/buildings", mgr);
    expect(buildings.body.find((b: { id: string }) => b.id === buildingId).name).toBe("Block A (renamed)");
    const floors = await h.req("get", "/property/floors", mgr);
    expect(floors.body.find((f: { id: string }) => f.id === floorId).label).toBe("Ground");
    const rooms = await h.req("get", "/property/rooms", mgr);
    expect(rooms.body.find((r: { id: string }) => r.id === roomId).label).toBe("101A");
    const beds = await h.req("get", `/property/beds?roomId=${roomId}`, mgr);
    expect(beds.body.find((b: { id: string }) => b.id === bed2).label).toBe("B2");
  });

  it("rejects an empty rename (400) and a cross-tenant rename (404)", async () => {
    expect(
      (await h.req("patch", `/property/rooms/${roomId}`, pgA.managerToken, { label: "" })).status,
    ).toBe(400);
    // PG B cannot rename PG A's building — RLS hides it → 404.
    expect(
      (await h.req("patch", `/property/buildings/${buildingId}`, pgB.managerToken, { name: "Hijack" })).status,
    ).toBe(404);
  });

  it("rejects resident registration without an age (400)", async () => {
    const res = await h.req("post", "/residents", pgA.managerToken, {
      name: "No Age",
      phone: randomPhone(),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a non-Indian phone number (400)", async () => {
    const res = await h.req("post", "/residents", pgA.managerToken, {
      name: "Bad Phone",
      phone: "+15551234567",
      age: 30,
    });
    expect(res.status).toBe(400);
  });

  it("rejects a half-filled emergency contact (400)", async () => {
    const res = await h.req("post", "/residents", pgA.managerToken, {
      name: "Half Emergency",
      phone: randomPhone(),
      age: 30,
      emergencyContactName: "Ramesh",
    });
    expect(res.status).toBe(400);
  });

  it("accepts a full emergency contact", async () => {
    const res = await h.req("post", "/residents", pgA.managerToken, {
      name: "Full Emergency",
      phone: randomPhone(),
      age: 30,
      emergencyContactName: "Ramesh Sharma",
      emergencyContactRelation: "FATHER",
      emergencyContactPhone: randomPhone(),
    });
    expect(res.status).toBe(201);
    const got = await h.req(
      "get",
      `/residents/${res.body.id}`,
      pgA.managerToken,
    );
    expect(got.body).toMatchObject({
      age: 30,
      emergencyContactName: "Ramesh Sharma",
      emergencyContactRelation: "FATHER",
    });
  });

  it("rejects a duplicate phone within the PG with 409 (not a 500)", async () => {
    const phone = randomPhone();
    const first = await h.req("post", "/residents", pgA.managerToken, {
      name: "First Phone",
      phone,
      age: 30,
    });
    expect(first.status).toBe(201);
    const dup = await h.req("post", "/residents", pgA.managerToken, {
      name: "Dup Phone",
      phone,
      age: 31,
    });
    expect(dup.status).toBe(409);
  });

  it("allocates a resident to a bed and lists it active", async () => {
    const res = await h.req("post", "/allocations", pgA.managerToken, {
      bedId: bed1,
      residentId: resident1,
    });
    expect(res.status).toBe(201);

    const active = await h.req("get", "/allocations", pgA.managerToken);
    expect(active.body).toHaveLength(1);
    expect(active.body[0]).toMatchObject({
      bedId: bed1,
      bedLabel: "A",
      residentId: resident1,
      residentName: "Res One",
      endDate: null,
    });
  });

  it("surfaces the bed occupant and the resident's full location path", async () => {
    // The occupied bed reports its resident; the vacant one stays empty.
    const beds = await h.req(
      "get",
      `/property/beds?roomId=${roomId}`,
      pgA.managerToken,
    );
    expect(beds.body.find((b: { id: string }) => b.id === bed1)).toMatchObject({
      status: "OCCUPIED",
      occupantResidentId: resident1,
      occupantName: "Res One",
    });
    const vacant = beds.body.find((b: { id: string }) => b.id === bed2);
    expect(vacant.occupantResidentId).toBeNull();
    expect(vacant.occupantName).toBeNull();

    // The resident summary carries bedId + the full path for the deep-link.
    // (building/floor/room were renamed earlier in this suite.)
    const r = await h.req("get", `/residents/${resident1}`, pgA.managerToken);
    expect(r.body).toMatchObject({
      bedId: bed1,
      bedLabel: "A",
      roomLabel: "101A",
      floorLabel: "Ground",
      buildingName: "Block A (renamed)",
    });
  });

  it("rejects a second active allocation on the same bed (409)", async () => {
    const res = await h.req("post", "/allocations", pgA.managerToken, {
      bedId: bed1,
      residentId: resident2,
    });
    expect(res.status).toBe(409);
  });

  it("rejects a second active allocation for the same resident (409)", async () => {
    const res = await h.req("post", "/allocations", pgA.managerToken, {
      bedId: bed2,
      residentId: resident1,
    });
    expect(res.status).toBe(409);
  });

  it("suggests the still-vacant bed for the unallocated resident", async () => {
    const res = await h.req(
      "get",
      `/allocations/suggestions?residentId=${resident2}`,
      pgA.managerToken,
    );
    expect(res.status).toBe(200);
    expect(res.body.map((b: { bedId: string }) => b.bedId)).toContain(bed2);
    expect(res.body.map((b: { bedId: string }) => b.bedId)).not.toContain(bed1); // occupied
  });

  it("cross-tenant: PG B cannot allocate PG A's bed (404), and sees no allocations", async () => {
    const res = await h.req("post", "/allocations", pgB.managerToken, {
      bedId: bed2,
      residentId: resident2,
    });
    expect(res.status).toBe(404);

    const bList = await h.req("get", "/allocations", pgB.managerToken);
    expect(bList.body).toHaveLength(0);
  });

  it("moves a resident out, freeing the bed for re-allocation", async () => {
    const out = await h.req("post", "/allocations/move-out", pgA.managerToken, {
      residentId: resident1,
    });
    expect(out.status).toBe(201);
    expect(out.body.ended).toBe(true);

    const active = await h.req("get", "/allocations", pgA.managerToken);
    expect(active.body).toHaveLength(0);

    // Bed is vacant again → re-allocating the other resident now succeeds.
    const re = await h.req("post", "/allocations", pgA.managerToken, {
      bedId: bed1,
      residentId: resident2,
    });
    expect(re.status).toBe(201);
  });
});
