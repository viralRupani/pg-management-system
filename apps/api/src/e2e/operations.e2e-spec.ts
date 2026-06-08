import { createHarness, randomPhone, type Harness, type TestPg } from "./harness";

/**
 * M5 operations layer e2e: complaints, menu, announcements, budgets/expenses.
 * Proves tenant-SHARED reads (menu/announcements) are visible to residents,
 * resident-OWNED reads (complaints) are isolated within a tenant, manager-only
 * routes reject residents (403), and everything is cross-tenant invisible.
 */
describe("M5 operations (e2e)", () => {
  let h: Harness;
  let pgA: TestPg;
  let pgB: TestPg;
  let residentA: string; // token
  let residentA2Id: string;
  let residentA2: string; // token

  beforeAll(async () => {
    h = await createHarness();
    pgA = await h.onboardPg("ops-a");
    pgB = await h.onboardPg("ops-b");

    const phone1 = randomPhone();
    await h.registerResident(pgA.managerToken, { name: "Res One", phone: phone1 });
    residentA = await h.residentLogin(pgA.slug, pgA.id, phone1);

    const phone2 = randomPhone();
    residentA2Id = await h.registerResident(pgA.managerToken, {
      name: "Res Two",
      phone: phone2,
    });
    residentA2 = await h.residentLogin(pgA.slug, pgA.id, phone2);
  }, 30000);

  afterAll(async () => {
    await h?.close();
  });

  describe("complaints (resident-owned within a tenant)", () => {
    let complaintId: string;

    it("resident files a complaint", async () => {
      const res = await h.req("post", "/complaints", residentA, {
        category: "MAINTENANCE",
        description: "Leaky tap in 101",
      });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      complaintId = res.body.id;
    });

    it("manager sees the complaint; filing resident sees it in /mine", async () => {
      const mgr = await h.req("get", "/complaints", pgA.managerToken);
      expect(mgr.status).toBe(200);
      expect(mgr.body.some((c: { id: string }) => c.id === complaintId)).toBe(true);

      const mine = await h.req("get", "/complaints/mine", residentA);
      expect(mine.body.map((c: { id: string }) => c.id)).toContain(complaintId);
    });

    it("a DIFFERENT resident cannot read the thread (404, intra-tenant)", async () => {
      const res = await h.req("get", `/complaints/${complaintId}/updates`, residentA2);
      expect(res.status).toBe(404);
    });

    it("the other resident's /mine does not include it", async () => {
      const mine = await h.req("get", "/complaints/mine", residentA2);
      expect(mine.body.map((c: { id: string }) => c.id)).not.toContain(complaintId);
    });

    it("manager updates status; resident cannot", async () => {
      const ok = await h.req("post", `/complaints/${complaintId}/status`, pgA.managerToken, {
        status: "RESOLVED",
        assignToSelf: true,
      });
      expect(ok.status).toBe(201);
      expect(ok.body.status).toBe("RESOLVED");

      const denied = await h.req("post", `/complaints/${complaintId}/status`, residentA, {
        status: "OPEN",
      });
      expect(denied.status).toBe(403);
    });

    it("manager gets a download URL for a complaint photo; no-photo 404s", async () => {
      // The first complaint was filed without a photo → 404.
      const noPhoto = await h.req(
        "get",
        `/complaints/${complaintId}/photo`,
        pgA.managerToken,
      );
      expect(noPhoto.status).toBe(404);

      // File a complaint WITH a photo (resident presigns an upload key first).
      const presign = await h.req("post", "/complaints/photo-url", residentA);
      expect(presign.status).toBe(201);
      const photoKey = presign.body.key as string;

      const filed = await h.req("post", "/complaints", residentA, {
        category: "CLEANLINESS",
        description: "Dirty common area",
        photoKey,
      });
      expect(filed.status).toBe(201);

      // Manager list exposes the photoKey, and the photo endpoint presigns it.
      const list = await h.req("get", "/complaints", pgA.managerToken);
      const withPhoto = list.body.find(
        (c: { id: string }) => c.id === filed.body.id,
      );
      expect(withPhoto.photoKey).toBe(photoKey);

      const photo = await h.req(
        "get",
        `/complaints/${filed.body.id}/photo`,
        pgA.managerToken,
      );
      expect(photo.status).toBe(200);
      expect(photo.body.downloadUrl).toContain(photoKey);
    });
  });

  describe("menu (tenant-shared)", () => {
    it("manager publishes and re-publish is an upsert", async () => {
      const first = await h.req("post", "/menu", pgA.managerToken, {
        menuDate: "2026-06-10",
        mealType: "LUNCH",
        items: "Dal, Rice",
      });
      expect(first.status).toBe(201);
      const second = await h.req("post", "/menu", pgA.managerToken, {
        menuDate: "2026-06-10",
        mealType: "LUNCH",
        items: "Dal, Rice, Salad",
      });
      expect(second.body.id).toBe(first.body.id); // same row, upserted
    });

    it("resident CAN read the menu range; replaced items win", async () => {
      const res = await h.req(
        "get",
        "/menu?from=2026-06-01&to=2026-06-30",
        residentA,
      );
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].items).toBe("Dal, Rice, Salad");
    });

    it("missing from/to => 400", async () => {
      const res = await h.req("get", "/menu", pgA.managerToken);
      expect(res.status).toBe(400);
    });

    it("PG B sees none of PG A's menu (cross-tenant)", async () => {
      const res = await h.req(
        "get",
        "/menu?from=2026-06-01&to=2026-06-30",
        pgB.managerToken,
      );
      expect(res.body).toHaveLength(0);
    });
  });

  describe("announcements (tenant-shared)", () => {
    it("manager posts; resident can read; resident cannot post", async () => {
      const post = await h.req("post", "/announcements", pgA.managerToken, {
        title: "Water cut",
        body: "No water 2-4pm",
      });
      expect(post.status).toBe(201);

      const read = await h.req("get", "/announcements", residentA);
      expect(read.body[0].title).toBe("Water cut");

      const denied = await h.req("post", "/announcements", residentA, {
        title: "x",
        body: "y",
      });
      expect(denied.status).toBe(403);
    });

    it("PG B sees none of PG A's announcements", async () => {
      const res = await h.req("get", "/announcements", pgB.managerToken);
      expect(res.body).toHaveLength(0);
    });
  });

  describe("budgets & expenses (manager-only)", () => {
    beforeAll(async () => {
      await h.req("post", "/budgets", pgA.managerToken, {
        category: "Groceries",
        period: "2026-06",
        limitPaise: 5000000,
      });
      await h.req("post", "/budgets", pgA.managerToken, {
        category: "Groceries",
        period: "2026-06",
        limitPaise: 6000000, // upsert
      });
      await h.req("post", "/expenses", pgA.managerToken, {
        category: "Groceries",
        amountPaise: 120000,
        spentOn: "2026-06-05",
        note: "Veg",
      });
      await h.req("post", "/expenses", pgA.managerToken, {
        category: "Groceries",
        amountPaise: 80000,
        spentOn: "2026-06-06",
      });
      await h.req("post", "/expenses", pgA.managerToken, {
        category: "Electricity",
        amountPaise: 300000,
        spentOn: "2026-06-07", // no budget set
      });
      await h.req("post", "/expenses", pgA.managerToken, {
        category: "Groceries",
        amountPaise: 999999,
        spentOn: "2026-07-01", // different month, must be excluded from June
      });
    });

    it("expenses are scoped to the period", async () => {
      const res = await h.req("get", "/expenses?period=2026-06", pgA.managerToken);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
    });

    it("summary: upsert limit, period-scoped spend, null limit for no-budget category, sorted", async () => {
      const res = await h.req(
        "get",
        "/budgets/summary?period=2026-06",
        pgA.managerToken,
      );
      const groceries = res.body.find((r: { category: string }) => r.category === "Groceries");
      const electricity = res.body.find((r: { category: string }) => r.category === "Electricity");
      expect(groceries.limitPaise).toBe(6000000);
      expect(groceries.spentPaise).toBe(200000); // July excluded
      expect(electricity.limitPaise).toBeNull();
      expect(electricity.spentPaise).toBe(300000);
      expect(res.body[0].category).toBe("Electricity"); // sorted
      expect(res.body[1].category).toBe("Groceries");
    });

    it("resident cannot reach any budget/expense route (403)", async () => {
      const set = await h.req("post", "/budgets", residentA, {
        category: "x",
        period: "2026-06",
        limitPaise: 1,
      });
      const summary = await h.req("get", "/budgets/summary?period=2026-06", residentA);
      const expenses = await h.req("get", "/expenses?period=2026-06", residentA);
      expect(set.status).toBe(403);
      expect(summary.status).toBe(403);
      expect(expenses.status).toBe(403);
    });

    it("missing period => 400", async () => {
      const res = await h.req("get", "/expenses", pgA.managerToken);
      expect(res.status).toBe(400);
    });

    it("PG B summary is empty (cross-tenant)", async () => {
      const res = await h.req(
        "get",
        "/budgets/summary?period=2026-06",
        pgB.managerToken,
      );
      expect(res.body).toHaveLength(0);
    });
  });
});
