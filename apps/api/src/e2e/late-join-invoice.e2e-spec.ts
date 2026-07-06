import {
  createHarness,
  randomPhone,
  type Harness,
  type TestPg,
} from "./harness";
import { istMomentUtc, istPeriod } from "../common/ist-date";
import { prorateSegment } from "../rent/rent.proration";

/**
 * Late-join auto-invoicing: when a resident is registered and allocated a bed
 * LIVE (move-in today) AFTER the PG's scheduled invoice-generation moment for
 * this period has already passed, the tenant-wide scheduled run has already
 * skipped them — so `AllocationService.allocate` bills that one resident on the
 * spot (`InvoiceScheduleService.generateForResidentIfDue`). Only when a schedule
 * exists and its moment is behind `now`; never for a manual-only PG, never before
 * the moment (the normal run will pick them up). Idempotent with the dispatcher.
 *
 * Assertions are scoped to THIS run's tenant via the RLS manager invoice list.
 */
describe("late-join invoice (e2e)", () => {
  let h: Harness;

  async function newId(res: {
    status: number;
    body: { id: string };
  }): Promise<string> {
    if (res.status !== 201 && res.status !== 200)
      throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.id;
  }

  // One building/floor/room/bed; returns the bed id + its monthly rent.
  async function makeBed(
    mgr: string,
    monthlyRentPaise: number,
  ): Promise<string> {
    const buildingId = await newId(
      await h.req("post", "/property/buildings", mgr, { name: "Block" }),
    );
    const floorId = await newId(
      await h.req("post", "/property/floors", mgr, { buildingId, label: "G" }),
    );
    const roomId = await newId(
      await h.req("post", "/property/rooms", mgr, {
        floorId,
        label: "R",
        capacity: 1,
        monthlyRentPaise,
      }),
    );
    return newId(await h.req("post", "/property/beds", mgr, { roomId, label: "A" }));
  }

  beforeAll(async () => {
    h = await createHarness();
  }, 30000);

  afterAll(async () => {
    await h?.close();
  });

  it("bills a live-move-in resident when the schedule moment has already passed", async () => {
    const pg = await h.onboardPg("late-join-passed");
    const mgr = pg.managerToken;
    const rent = 600000;

    // Day 1 @ 00:00 IST is always behind "now" for the current period, so the
    // scheduled generation moment has passed.
    const sched = await h.req("put", "/invoices/schedule", mgr, {
      dayOfMonth: 1,
      hour: 0,
      minute: 0,
    });
    expect(sched.status).toBe(200);

    const bedId = await makeBed(mgr, rent);
    const residentId = await h.registerResident(mgr, {
      name: "Late Joiner",
      phone: randomPhone(),
    });

    const alloc = await h.req("post", "/allocations", mgr, { bedId, residentId });
    expect(alloc.status).toBe(201);

    const period = istPeriod(new Date());
    const invoices = await h.req("get", "/invoices", mgr);
    expect(invoices.body.total).toBe(1);
    const inv = invoices.body.items[0];
    expect(inv.residentId).toBe(residentId);
    expect(inv.period).toBe(period);
    // Prorated join-day..month-end (day-granular IST), matching generateMonthly.
    const expected = prorateSegment(rent, new Date(), null, period);
    expect(inv.amountPaise).toBe(expected);
    expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThanOrEqual(rent);

    // Idempotent: a subsequent tenant-wide scheduled dispatch must not add a
    // duplicate. (generateForResidentIfDue does NOT stamp lastRunPeriod, so a
    // due schedule still fires here — and correctly skips the already-billed
    // resident.)
    const dispatch = await h.req(
      "post",
      "/platform/jobs/dispatch-scheduled-invoices",
      h.platformToken(),
    );
    expect(dispatch.status).toBe(201);
    const after = await h.req("get", "/invoices", mgr);
    expect(after.body.total).toBe(1);
  });

  it("does NOT auto-bill a manual-only PG (no schedule)", async () => {
    const pg = await h.onboardPg("late-join-manual");
    const mgr = pg.managerToken;
    const bedId = await makeBed(mgr, 500000);
    const residentId = await h.registerResident(mgr, {
      name: "Manual PG Res",
      phone: randomPhone(),
    });

    const alloc = await h.req("post", "/allocations", mgr, { bedId, residentId });
    expect(alloc.status).toBe(201);

    // No schedule → the manager controls generation; nothing is auto-created.
    const invoices = await h.req("get", "/invoices", mgr);
    expect(invoices.body.total).toBe(0);
  });

  it("only fires once the scheduled moment is behind now (day-28 23:59 boundary)", async () => {
    const pg = await h.onboardPg("late-join-ahead");
    const mgr = pg.managerToken;
    await h.req("put", "/invoices/schedule", mgr, {
      dayOfMonth: 28,
      hour: 23,
      minute: 59,
    });

    const bedId = await makeBed(mgr, 500000);
    const residentId = await h.registerResident(mgr, {
      name: "Boundary Res",
      phone: randomPhone(),
    });
    await h.req("post", "/allocations", mgr, { bedId, residentId });

    // The 28th @ 23:59 IST is the latest representable moment; whether it has
    // passed depends on the calendar day of the run — assert the outcome that
    // matches it deterministically either way.
    const period = istPeriod(new Date());
    const moment = istMomentUtc(period, 28, 23, 59);
    const shouldFire = new Date() >= moment;

    const invoices = await h.req("get", "/invoices", mgr);
    expect(invoices.body.total).toBe(shouldFire ? 1 : 0);
  });
});
