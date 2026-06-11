import { createHarness, randomPhone, type Harness, type TestPg } from "./harness";

/**
 * M8 resident-driven additions: a resident raises their own move-out request
 * (separate from the manager-driven exit settlement), and a resident reads the
 * presigned URL for their OWN complaint photo. Both must stay resident-scoped:
 * the request guards against double-submit, and one resident can never read
 * another's photo (intra-tenant ownership, not just RLS).
 */
describe("M8 resident exit-request & complaint photo (e2e)", () => {
  let h: Harness;
  let pgA: TestPg;

  let r1Id: string;
  let r1: string; // token
  let r2: string; // token

  async function newId(res: { status: number; body: { id: string } }): Promise<string> {
    if (res.status !== 201 && res.status !== 200)
      throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.id;
  }

  beforeAll(async () => {
    h = await createHarness();
    pgA = await h.onboardPg("exit-a");
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
    const bedA = await newId(await h.req("post", "/property/beds", mgr, { roomId, label: "A" }));
    const bedB = await newId(await h.req("post", "/property/beds", mgr, { roomId, label: "B" }));

    const p1 = randomPhone();
    const p2 = randomPhone();
    r1Id = await h.registerResident(mgr, { name: "Res One", phone: p1 });
    const r2Id = await h.registerResident(mgr, { name: "Res Two", phone: p2 });
    r1 = await h.residentLogin(pgA.slug, pgA.id, p1);
    r2 = await h.residentLogin(pgA.slug, pgA.id, p2);
    await h.req("post", "/allocations", mgr, { bedId: bedA, residentId: r1Id });
    await h.req("post", "/allocations", mgr, { bedId: bedB, residentId: r2Id });
  }, 30000);

  afterAll(async () => {
    await h?.close();
  });

  describe("resident move-out request", () => {
    it("starts with no pending request", async () => {
      const mine = await h.req("get", "/deposits/mine", r1);
      expect(mine.body.exitRequest).toBeNull();
    });

    it("a resident raises a request; it surfaces on /deposits/mine and to the manager", async () => {
      const res = await h.req("post", "/deposits/exit-request", r1, {
        requestedDate: "2026-08-15",
        note: "Moving for a new job",
      });
      expect(res.status).toBe(201);
      expect(res.body.requestedDate).toBe("2026-08-15");

      const mine = await h.req("get", "/deposits/mine", r1);
      expect(mine.body.exitRequest).toMatchObject({
        requestedDate: "2026-08-15",
        note: "Moving for a new job",
      });
      expect(mine.body.exitRequest.requestedAt).toBeTruthy();

      // The manager (any-resident read) sees the same pending request.
      const mgrView = await h.req("get", `/deposits/resident/${r1Id}`, pgA.managerToken);
      expect(mgrView.body.exitRequest.requestedDate).toBe("2026-08-15");
    });

    it("a second request while one is pending is rejected (409)", async () => {
      const res = await h.req("post", "/deposits/exit-request", r1, {
        requestedDate: "2026-09-01",
      });
      expect(res.status).toBe(409);
    });

    it("does not leak across residents (r2 has none)", async () => {
      const mine = await h.req("get", "/deposits/mine", r2);
      expect(mine.body.exitRequest).toBeNull();
    });

    it("rejects a malformed date (400)", async () => {
      const res = await h.req("post", "/deposits/exit-request", r2, {
        requestedDate: "15-08-2026",
      });
      expect(res.status).toBe(400);
    });
  });

  describe("resident complaint photo read", () => {
    let complaintId: string;

    it("a resident reads the presigned URL for their OWN complaint photo", async () => {
      const presign = await h.req("post", "/complaints/photo-url", r1, {
        contentType: "image/jpeg",
      });
      expect(presign.status).toBe(201);
      const key = presign.body.key as string;
      expect(key).toBeTruthy();

      complaintId = await newId(
        await h.req("post", "/complaints", r1, {
          category: "MAINTENANCE",
          description: "Leaking tap in the bathroom",
          photoKey: key,
        }),
      );

      const photo = await h.req("get", `/complaints/${complaintId}/photo`, r1);
      expect(photo.status).toBe(200);
      expect(photo.body.downloadUrl).toBeTruthy();

      // The manager can read it too (shared route).
      const mgrPhoto = await h.req("get", `/complaints/${complaintId}/photo`, pgA.managerToken);
      expect(mgrPhoto.status).toBe(200);
    });

    it("another resident cannot read it (404, intra-tenant ownership)", async () => {
      const photo = await h.req("get", `/complaints/${complaintId}/photo`, r2);
      expect(photo.status).toBe(404);
    });
  });
});
