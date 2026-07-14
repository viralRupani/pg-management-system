import { createHarness, randomPhone, type Harness, type TestPg } from "./harness";

/**
 * Dashboard alerts: the manager's "needs attention" counts (pending move-out
 * requests + payments/KYC/complaints awaiting action) that power the topbar bell
 * and dashboard panel. Must aggregate the actor's OWN tenant only — a second
 * tenant's pending work is invisible (RLS), and the residents list must expose
 * the same exit-requested flag/filter the bell links to.
 */
describe("Dashboard alerts (e2e)", () => {
  let h: Harness;
  let pgA: TestPg;
  let pgB: TestPg;

  let r1Id: string;
  let r1: string; // resident token (pgA)

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
    pgA = await h.onboardPg("alerts-a");
    pgB = await h.onboardPg("alerts-b");
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
        monthlyRentPaise: 800000,
      }),
    );
    const bedA = await newId(
      await h.req("post", "/property/beds", mgr, { roomId, label: "A" }),
    );

    const p1 = randomPhone();
    r1Id = await h.registerResident(mgr, { name: "Res One", phone: p1 });
    r1 = await h.residentLogin(pgA.slug, pgA.id, p1);
    await h.req("post", "/allocations", mgr, { bedId: bedA, residentId: r1Id });
  }, 30000);

  afterAll(async () => {
    await h?.close();
  });

  it("starts with a clean slate (no pending actions)", async () => {
    const res = await h.req("get", "/dashboard/alerts", pgA.managerToken);
    expect(res.status).toBe(200);
    expect(res.body.exitRequests.count).toBe(0);
    expect(res.body.exitRequests.items).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it("surfaces a resident's move-out request to the manager", async () => {
    const reqRes = await h.req("post", "/deposits/exit-request", r1, {
      requestedDate: "2026-08-15",
      note: "Moving for a new job",
    });
    expect(reqRes.status).toBe(201);

    const res = await h.req("get", "/dashboard/alerts", pgA.managerToken);
    expect(res.body.exitRequests.count).toBe(1);
    expect(res.body.exitRequests.items).toHaveLength(1);
    expect(res.body.exitRequests.items[0]).toMatchObject({
      residentId: r1Id,
      name: "Res One",
      pendingType: "REQUEST",
      requestedDate: "2026-08-15",
      note: "Moving for a new job",
    });
    expect(res.body.exitRequests.items[0].requestedAt).toBeTruthy();
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  it("drops off the alert feed once the manager approves it", async () => {
    const approve = await h.req(
      "post",
      `/deposits/exit-request/${r1Id}/approve`,
      pgA.managerToken,
    );
    expect(approve.status).toBe(201);
    expect(approve.body.effective).toMatchObject({ date: "2026-08-15" });

    const res = await h.req("get", "/dashboard/alerts", pgA.managerToken);
    expect(res.body.exitRequests.count).toBe(0);
    expect(res.body.exitRequests.items).toEqual([]);
  });

  it("counts an open complaint", async () => {
    await h.req("post", "/complaints", r1, {
      category: "MAINTENANCE",
      description: "Leaking tap",
    });
    const res = await h.req("get", "/dashboard/alerts", pgA.managerToken);
    expect(res.body.openComplaints).toBe(1);
    expect(res.body.total).toBe(
      res.body.exitRequests.count +
        res.body.paymentsToReview +
        res.body.kycToVerify +
        res.body.openComplaints,
    );
  });

  it("the residents list filters + tags the exit-requested resident", async () => {
    const filtered = await h.req(
      "get",
      "/residents?exitRequested=true&status=ALL",
      pgA.managerToken,
    );
    expect(filtered.status).toBe(200);
    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.items[0].id).toBe(r1Id);
    expect(filtered.body.items[0].exitRequestedDate).toBe("2026-08-15");

    // A resident with no request is absent from the filtered list.
    const detail = await h.req("get", `/residents/${r1Id}`, pgA.managerToken);
    expect(detail.body.exitRequestedDate).toBe("2026-08-15");
  });

  it("does not leak across tenants (pgB sees nothing)", async () => {
    const res = await h.req("get", "/dashboard/alerts", pgB.managerToken);
    expect(res.body.exitRequests.count).toBe(0);
    expect(res.body.openComplaints).toBe(0);
    expect(res.body.total).toBe(0);

    const filtered = await h.req(
      "get",
      "/residents?exitRequested=true&status=ALL",
      pgB.managerToken,
    );
    expect(filtered.body.items).toHaveLength(0);
  });
});
