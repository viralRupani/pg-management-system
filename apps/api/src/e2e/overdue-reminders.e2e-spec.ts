import { createHarness, randomPhone, type Harness, type TestPg } from "./harness";

/**
 * Overdue transition + reminder scoping (the two M3 production blockers).
 *
 * Discriminating setup: two residents in one tenant, same period, but one
 * invoice is past its due date and the other isn't (we override `dueDate` per
 * resident at generation). That single asymmetry proves both fixes:
 *  - `mark-overdue` flips ONLY the past-due PENDING invoice to OVERDUE;
 *  - `rent-reminders` notifies ONLY the resident whose invoice is due/overdue,
 *    skipping the not-yet-due one (the old unscoped query nagged on every
 *    PENDING invoice regardless of due date).
 *
 * The batch jobs are cross-tenant (they read every tenant), so assertions are
 * scoped to this run's two residents — their invoice status and notification
 * feed — never a global count.
 */
describe("overdue transition + reminder scoping (e2e)", () => {
  let h: Harness;
  let pg: TestPg;
  const ROOM_RENT = 800000;
  const PERIOD = "2026-06";

  let dueResidentId: string; // invoice already past due
  let futureResidentId: string; // invoice not yet due
  let dueResident: string; // token
  let futureResident: string; // token

  async function newId(res: { status: number; body: { id: string } }): Promise<string> {
    if (res.status !== 201 && res.status !== 200)
      throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.id;
  }

  function statusOf(items: Array<{ residentId: string; status: string }>, residentId: string) {
    return items.find((i) => i.residentId === residentId)?.status;
  }

  beforeAll(async () => {
    h = await createHarness();
    pg = await h.onboardPg("overdue");
    const mgr = pg.managerToken;

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
    const bed1 = await newId(await h.req("post", "/property/beds", mgr, { roomId, label: "A" }));
    const bed2 = await newId(await h.req("post", "/property/beds", mgr, { roomId, label: "B" }));

    const phone1 = randomPhone();
    const phone2 = randomPhone();
    dueResidentId = await h.registerResident(mgr, { name: "Due Resident", phone: phone1 });
    futureResidentId = await h.registerResident(mgr, { name: "Future Resident", phone: phone2 });
    dueResident = await h.residentLogin(pg.slug, pg.id, phone1);
    futureResident = await h.residentLogin(pg.slug, pg.id, phone2);

    // Full-month allocation (start on the 1st) so proration doesn't enter into it.
    await h.req("post", "/allocations", mgr, {
      bedId: bed1,
      residentId: dueResidentId,
      startDate: "2026-06-01",
    });
    await h.req("post", "/allocations", mgr, {
      bedId: bed2,
      residentId: futureResidentId,
      startDate: "2026-06-01",
    });

    // Same period, but distinct due dates: one long past, one far future. Generate
    // per-resident (residentIds subset) so each gets its own dueDate.
    await h.req("post", "/invoices/generate", mgr, {
      period: PERIOD,
      dueDate: "2020-01-01",
      residentIds: [dueResidentId],
    });
    await h.req("post", "/invoices/generate", mgr, {
      period: PERIOD,
      dueDate: "2099-01-01",
      residentIds: [futureResidentId],
    });
  }, 30000);

  afterAll(async () => {
    await h?.close();
  });

  it("both invoices start PENDING", async () => {
    const all = await h.req("get", "/invoices", pg.managerToken);
    expect(statusOf(all.body.items, dueResidentId)).toBe("PENDING");
    expect(statusOf(all.body.items, futureResidentId)).toBe("PENDING");
  });

  it("mark-overdue flips only the past-due invoice to OVERDUE", async () => {
    const res = await h.req("post", "/platform/jobs/mark-overdue", h.platformToken(), {
      period: PERIOD,
    });
    expect(res.status).toBe(201);

    const all = await h.req("get", "/invoices", pg.managerToken);
    expect(statusOf(all.body.items, dueResidentId)).toBe("OVERDUE");
    expect(statusOf(all.body.items, futureResidentId)).toBe("PENDING");
  });

  it("re-running mark-overdue is idempotent (PAID/WAIVED/OVERDUE untouched)", async () => {
    await h.req("post", "/platform/jobs/mark-overdue", h.platformToken(), { period: PERIOD });
    const all = await h.req("get", "/invoices", pg.managerToken);
    expect(statusOf(all.body.items, dueResidentId)).toBe("OVERDUE");
  });

  it("reminders notify only the due/overdue resident, not the not-yet-due one", async () => {
    const res = await h.req("post", "/platform/jobs/rent-reminders", h.platformToken(), {
      period: PERIOD,
    });
    expect(res.status).toBe(201);

    const dueFeed = await h.req("get", "/notifications", dueResident);
    const dueReminders = dueFeed.body.filter(
      (n: { type: string }) => n.type === "RENT_REMINDER",
    );
    expect(dueReminders).toHaveLength(1);
    expect(dueReminders[0].title).toBe("Rent overdue");

    const futureFeed = await h.req("get", "/notifications", futureResident);
    const futureReminders = futureFeed.body.filter(
      (n: { type: string }) => n.type === "RENT_REMINDER",
    );
    expect(futureReminders).toHaveLength(0);
  });
});
