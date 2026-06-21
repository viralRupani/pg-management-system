import { createHarness, randomPhone, type Harness, type TestPg } from "./harness";

/**
 * M6 super-admin metering + white-labeling e2e.
 *
 * NOTE: metering reads cross-tenant via the BYPASSRLS pool, so `/platform/*`
 * responses include EVERY tenant in the DB (incl. leftovers from interrupted
 * runs). Every assertion here therefore scopes to THIS run's onboarded tenant
 * ids and asserts exact per-tenant numbers — never a global count/sum.
 */
describe("M6 metering & branding (e2e)", () => {
  let h: Harness;
  let pgA: TestPg;
  let pgB: TestPg;
  let plat: string;
  let aR1: string; // resident ids in A
  const PERIOD = "2026-06";
  const RATE = 1000; // BILLING_RATE_PAISE (₹10)

  async function newId(res: { status: number; body: { id: string } }): Promise<string> {
    if (res.status !== 201 && res.status !== 200)
      throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.id;
  }

  /** Build a single room with `n` beds and allocate `n` fresh residents. Returns resident ids. */
  async function seedAllocated(pg: TestPg, n: number): Promise<string[]> {
    const mgr = pg.managerToken;
    const buildingId = await newId(await h.req("post", "/property/buildings", mgr, { name: "B" }));
    const floorId = await newId(await h.req("post", "/property/floors", mgr, { buildingId, label: "G" }));
    const roomId = await newId(
      await h.req("post", "/property/rooms", mgr, { floorId, label: "101", capacity: n, monthlyRentPaise: 500000 }),
    );
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const bedId = await newId(await h.req("post", "/property/beds", mgr, { roomId, label: `b${i}` }));
      const rid = await h.registerResident(mgr, { name: `R${i}`, phone: randomPhone() });
      await h.req("post", "/allocations", mgr, { bedId, residentId: rid });
      ids.push(rid);
    }
    return ids;
  }

  beforeAll(async () => {
    h = await createHarness();
    pgA = await h.onboardPg("meter-a");
    pgB = await h.onboardPg("meter-b");
    plat = h.platformToken();

    const aIds = await seedAllocated(pgA, 2); // A: 2 active
    aR1 = aIds[0];
    await seedAllocated(pgB, 1); // B: 1 active

    // A registers + allocates a 3rd resident, then moves them out — must NOT count.
    const mgr = pgA.managerToken;
    const roomId = await newId(
      await h.req("post", "/property/rooms", mgr, {
        floorId: await newId(
          await h.req("post", "/property/floors", mgr, {
            buildingId: await newId(await h.req("post", "/property/buildings", mgr, { name: "B2" })),
            label: "1",
          }),
        ),
        label: "201",
        capacity: 1,
        monthlyRentPaise: 500000,
      }),
    );
    const bedId = await newId(await h.req("post", "/property/beds", mgr, { roomId, label: "x" }));
    const goneId = await h.registerResident(mgr, { name: "Gone", phone: randomPhone() });
    await h.req("post", "/allocations", mgr, { bedId, residentId: goneId });
    await h.req("post", "/allocations/move-out", mgr, { residentId: goneId });
  }, 30000);

  afterAll(async () => {
    await h?.close();
  });

  describe("metering (platform-admin)", () => {
    function rowFor(body: Array<{ tenantId: string }>, id: string) {
      return body.find((r) => r.tenantId === id);
    }

    it("live overview reports current bed-allocated headcount + revenue per PG", async () => {
      const res = await h.req("get", "/platform/overview", plat);
      expect(res.status).toBe(200);
      const a = rowFor(res.body, pgA.id);
      const b = rowFor(res.body, pgB.id);
      expect(a).toMatchObject({ activeResidents: 2, estimatedRevenuePaise: 2 * RATE });
      expect(b).toMatchObject({ activeResidents: 1, estimatedRevenuePaise: 1 * RATE });
    });

    it("snapshot persists per-tenant headcount; rate + amount denormalized", async () => {
      const run = await h.req("post", "/platform/billing/snapshot", plat, { period: PERIOD });
      expect(run.status).toBe(201);
      expect(run.body.period).toBe(PERIOD);

      const list = await h.req("get", `/platform/billing/snapshots?period=${PERIOD}`, plat);
      const a = rowFor(list.body, pgA.id);
      const b = rowFor(list.body, pgB.id);
      expect(a).toMatchObject({ activeResidents: 2, ratePaise: RATE, amountDuePaise: 2 * RATE });
      expect(b).toMatchObject({ activeResidents: 1, ratePaise: RATE, amountDuePaise: 1 * RATE });
    });

    it("re-snapshotting the same period REFRESHES, not duplicates", async () => {
      // A loses a resident, then we re-run the same period.
      await h.req("post", "/allocations/move-out", pgA.managerToken, { residentId: aR1 });
      await h.req("post", "/platform/billing/snapshot", plat, { period: PERIOD });

      const list = await h.req("get", `/platform/billing/snapshots?period=${PERIOD}`, plat);
      const aRows = list.body.filter((r: { tenantId: string }) => r.tenantId === pgA.id);
      expect(aRows).toHaveLength(1); // one row per (tenant, period)
      expect(aRows[0]).toMatchObject({ activeResidents: 1, amountDuePaise: 1 * RATE });
    });

    it("a manager cannot reach platform metering (403)", async () => {
      const overview = await h.req("get", "/platform/overview", pgA.managerToken);
      const snap = await h.req("post", "/platform/billing/snapshot", pgA.managerToken, {});
      expect(overview.status).toBe(403);
      expect(snap.status).toBe(403);
    });
  });

  describe("white-labeling (branding)", () => {
    it("public by-slug branding read needs no auth", async () => {
      const res = await h.req("get", `/branding/${pgA.slug}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ slug: pgA.slug, logoUrl: null, accentColor: null });
      expect(res.body.name).toContain("meter-a");
    });

    it("unknown slug => 404", async () => {
      const res = await h.req("get", "/branding/no-such-pg-xyz");
      expect(res.status).toBe(404);
    });

    it("manager updates own branding; the public read reflects it", async () => {
      const patch = await h.req("patch", "/tenants/branding", pgA.managerToken, {
        name: "Sunrise PG",
        accentColor: "#1122AA",
      });
      expect(patch.status).toBe(200);
      expect(patch.body).toMatchObject({ name: "Sunrise PG", accentColor: "#1122AA" });

      const pub = await h.req("get", `/branding/${pgA.slug}`);
      expect(pub.body.name).toBe("Sunrise PG");
      expect(pub.body.accentColor).toBe("#1122AA");
    });

    it("a manager's update does NOT touch another PG (scoped by JWT tenant id)", async () => {
      const pubB = await h.req("get", `/branding/${pgB.slug}`);
      expect(pubB.body.name).not.toBe("Sunrise PG");
      expect(pubB.body.accentColor).toBeNull();
    });

    it("rejects an empty update (400) and a bad accent color (400)", async () => {
      const empty = await h.req("patch", "/tenants/branding", pgA.managerToken, {});
      const bad = await h.req("patch", "/tenants/branding", pgA.managerToken, { accentColor: "red" });
      expect(empty.status).toBe(400);
      expect(bad.status).toBe(400);
    });

    it("closes the logo loop: upload-url → store key → public read presigns it", async () => {
      const presign = await h.req("post", "/tenants/logo-url", pgA.managerToken, {
        contentType: "image/png",
      });
      expect(presign.status).toBe(201);
      expect(presign.body.url).toBeDefined();
      expect(presign.body.fields).toBeDefined();
      const key = presign.body.key;
      expect(key).toContain(`${pgA.id}/logos/`);

      // Store the KEY (not a URL) — this is what previously failed the .url() guard.
      const patch = await h.req("patch", "/tenants/branding", pgA.managerToken, { logoKey: key });
      expect(patch.status).toBe(200);

      // Public read resolves the stored key into a fresh presigned download URL.
      const pub = await h.req("get", `/branding/${pgA.slug}`);
      expect(pub.body.logoUrl).toBeDefined();
      expect(pub.body.logoUrl).toContain(key);
    });

    it("a resident cannot edit branding (403)", async () => {
      const phone = randomPhone();
      await h.registerResident(pgA.managerToken, { name: "Res", phone });
      const resToken = await h.residentLogin(pgA.slug, pgA.id, phone);
      const res = await h.req("patch", "/tenants/branding", resToken, { name: "Hacked" });
      expect(res.status).toBe(403);
    });
  });

  // PG code (slug) self-service: residents type this to log in. Runs LAST so the
  // slug change below doesn't perturb the branding reads above.
  describe("PG code (slug) update", () => {
    it("availability: another PG's code is taken, own + fresh codes are free", async () => {
      const taken = await h.req(
        "get",
        `/tenants/slug-available/${pgB.slug}`,
        pgA.managerToken,
      );
      expect(taken.body).toEqual({ available: false });

      const own = await h.req(
        "get",
        `/tenants/slug-available/${pgA.slug}`,
        pgA.managerToken,
      );
      expect(own.body).toEqual({ available: true });

      const fresh = await h.req(
        "get",
        "/tenants/slug-available/totally-unused-code-xyz",
        pgA.managerToken,
      );
      expect(fresh.body).toEqual({ available: true });
    });

    it("rejects taking another PG's code (409)", async () => {
      const res = await h.req("patch", "/tenants/slug", pgA.managerToken, {
        slug: pgB.slug,
      });
      expect(res.status).toBe(409);
    });

    it("rejects an invalid code (400)", async () => {
      const res = await h.req("patch", "/tenants/slug", pgA.managerToken, {
        slug: "Bad Code!",
      });
      expect(res.status).toBe(400);
    });

    it("changes the code; the new slug resolves and the old 404s", async () => {
      const oldSlug = pgA.slug;
      const newSlug = `${oldSlug}-renamed`;

      const patch = await h.req("patch", "/tenants/slug", pgA.managerToken, {
        slug: newSlug,
      });
      expect(patch.status).toBe(200);
      expect(patch.body.slug).toBe(newSlug);

      const pubNew = await h.req("get", `/branding/${newSlug}`);
      expect(pubNew.status).toBe(200);
      expect(pubNew.body.slug).toBe(newSlug);

      const pubOld = await h.req("get", `/branding/${oldSlug}`);
      expect(pubOld.status).toBe(404);

      pgA.slug = newSlug; // keep the harness in sync for teardown/reads
    });
  });
});
