import { eq } from "drizzle-orm";
import {
  createHarness,
  randomPhone,
  type Harness,
  type TestPg,
} from "./harness";
import { PLATFORM_DB, type Database } from "../db/database.module";
import { invoiceSchedules } from "../db/schema";
import { istPeriod } from "../common/ist-date";

/**
 * Per-PG automatic invoice-generation schedule: CRUD (GET/PUT/DELETE
 * /invoices/schedule), cross-tenant isolation (RLS — a tenant never sees or
 * edits another's schedule), and the dispatch logic via the platform trigger
 * (POST /platform/jobs/dispatch-scheduled-invoices). The dispatch reads ALL
 * tenants, so assertions are scoped to THIS run's tenant via the RLS-scoped
 * manager invoice list — never a global count (per apps/api/CLAUDE.md).
 */
describe("invoice schedule (e2e)", () => {
  let h: Harness;
  let pgA: TestPg;
  let pgB: TestPg;
  let platformDb: Database;

  async function newId(res: {
    status: number;
    body: { id: string };
  }): Promise<string> {
    if (res.status !== 201 && res.status !== 200)
      throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.id;
  }

  // Match the service: it stamps lastRunPeriod via istPeriod (IST), which can
  // differ from the UTC month in the 18:30–24:00 UTC window on a boundary day.
  const currentPeriod = (): string => istPeriod(new Date());

  beforeAll(async () => {
    h = await createHarness();
    platformDb = h.app.get<Database>(PLATFORM_DB);
    pgA = await h.onboardPg("sched-a");
    pgB = await h.onboardPg("sched-b");
  }, 30000);

  afterAll(async () => {
    await h?.close();
  });

  // No schedule → the controller returns null, which NestJS serializes as an
  // empty 200 body (supertest parses that as {}). The api-client coalesces it
  // back to null for callers.
  it("starts with no schedule", async () => {
    const res = await h.req("get", "/invoices/schedule", pgA.managerToken);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it("creates, reads, and edits the schedule (upsert)", async () => {
    // Day 1 @ 00:00 is always in the past for the current period, so the create
    // seeds lastRunPeriod = current period (it won't back-fire for a passed day).
    const created = await h.req("put", "/invoices/schedule", pgA.managerToken, {
      dayOfMonth: 1,
      hour: 0,
      minute: 0,
    });
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ dayOfMonth: 1, hour: 0, minute: 0 });
    expect(created.body.lastRunPeriod).toBe(currentPeriod());

    const got = await h.req("get", "/invoices/schedule", pgA.managerToken);
    expect(got.body).toMatchObject({ dayOfMonth: 1, hour: 0, minute: 0 });

    // Edit via the same endpoint; lastRunPeriod must be preserved.
    const edited = await h.req("put", "/invoices/schedule", pgA.managerToken, {
      dayOfMonth: 5,
      hour: 9,
      minute: 30,
    });
    expect(edited.body).toMatchObject({ dayOfMonth: 5, hour: 9, minute: 30 });
    expect(edited.body.lastRunPeriod).toBe(currentPeriod());
  });

  it("rejects out-of-range values (Zod)", async () => {
    const bad = await h.req("put", "/invoices/schedule", pgA.managerToken, {
      dayOfMonth: 31, // > 28
      hour: 9,
      minute: 0,
    });
    expect(bad.status).toBe(400);
  });

  it("is isolated across tenants (RLS)", async () => {
    // B has set nothing of its own → empty, despite A having a schedule.
    const bView = await h.req("get", "/invoices/schedule", pgB.managerToken);
    expect(bView.body).toEqual({});

    // B sets its own; A's is unchanged.
    await h.req("put", "/invoices/schedule", pgB.managerToken, {
      dayOfMonth: 20,
      hour: 18,
      minute: 0,
    });
    const aView = await h.req("get", "/invoices/schedule", pgA.managerToken);
    expect(aView.body).toMatchObject({ dayOfMonth: 5, hour: 9, minute: 30 });
  });

  it("deletes the schedule → reverts to manual-only", async () => {
    const del = await h.req("delete", "/invoices/schedule", pgB.managerToken);
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(true);
    const after = await h.req("get", "/invoices/schedule", pgB.managerToken);
    expect(after.body).toEqual({});
  });

  describe("dispatch", () => {
    let mgr: string;

    beforeAll(async () => {
      mgr = pgA.managerToken;
      // One allocated resident so generation has something to bill.
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
          capacity: 1,
          monthlyRentPaise: 500000,
        }),
      );
      const bedId = await newId(
        await h.req("post", "/property/beds", mgr, { roomId, label: "A" }),
      );
      const residentId = await h.registerResident(mgr, {
        name: "Sched Res",
        phone: randomPhone(),
      });
      await h.req("post", "/allocations", mgr, { bedId, residentId });
      // pgA's schedule from the CRUD block: day 1, 02:00, lastRunPeriod = current.
    });

    it("a freshly created schedule does not fire for the current month", async () => {
      // pgA's schedule was created for a past day, so lastRunPeriod was seeded to
      // the current period — the once-per-period guard blocks a same-month run.
      const res = await h.req(
        "post",
        "/platform/jobs/dispatch-scheduled-invoices",
        h.platformToken(),
      );
      expect(res.status).toBe(201);
      const invoices = await h.req("get", "/invoices", mgr);
      expect(invoices.body.total).toBe(0);
    });

    it("fires when due and is idempotent on re-run", async () => {
      // Simulate a new month: clear the once-per-period guard (set last run to a
      // prior period) so the schedule's day-1 00:00 moment is now due.
      await platformDb
        .update(invoiceSchedules)
        .set({ dayOfMonth: 1, hour: 0, minute: 0, lastRunPeriod: "2000-01" })
        .where(eq(invoiceSchedules.tenantId, pgA.id));

      const fire = await h.req(
        "post",
        "/platform/jobs/dispatch-scheduled-invoices",
        h.platformToken(),
      );
      expect(fire.status).toBe(201);
      const after = await h.req("get", "/invoices", mgr);
      expect(after.body.total).toBe(1); // the one allocated resident

      // lastRunPeriod is now stamped to the current period → a second dispatch
      // generates nothing (no duplicate invoices).
      await h.req(
        "post",
        "/platform/jobs/dispatch-scheduled-invoices",
        h.platformToken(),
      );
      const again = await h.req("get", "/invoices", mgr);
      expect(again.body.total).toBe(1);

      const sched = await h.req("get", "/invoices/schedule", mgr);
      expect(sched.body.lastRunPeriod).toBe(currentPeriod());
    });
  });
});
