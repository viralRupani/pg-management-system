import { addMonthsToPeriod, istPeriod } from "../common/ist-date";
import { createHarness, randomPhone, type Harness, type TestPg } from "./harness";

/**
 * Billing consequences of an approved move-out: the exit month (and every
 * month after) is never invoiced, and the LAST billed month is auto-settled
 * from the resident's held deposit when it fully covers the invoice — either
 * at generation time (the invoice is created fresh) or, if that invoice
 * already existed, as an apply-now step when the manager approves. Also
 * covers the booking guard: cancelling/changing an approved move-out is
 * blocked once an incoming resident's booking depends on the current bed.
 *
 * The harness clock is NOT frozen (see charges.e2e-spec.ts) — periods here are
 * computed relative to `istPeriod(new Date())`, and residents start on the 1st
 * of P0 so every month bills a full ROOM_RENT with no proration noise.
 */
describe("Exit auto-settle + booking guard (e2e)", () => {
  let h: Harness;
  let pgA: TestPg;
  const ROOM_RENT = 1000000; // ₹10,000
  const P0 = istPeriod(new Date());
  const P1 = addMonthsToPeriod(P0, 1);
  const P2 = addMonthsToPeriod(P0, 2);

  let buildingId: string;
  let floorId: string;
  let roomId: string;

  async function newId(res: { status: number; body: { id: string } }): Promise<string> {
    if (res.status !== 201 && res.status !== 200)
      throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.id;
  }

  async function makeResident(name: string) {
    const mgr = pgA.managerToken;
    const bedId = await newId(
      await h.req("post", "/property/beds", mgr, { roomId, label: name }),
    );
    const phone = randomPhone();
    const residentId = await h.registerResident(mgr, { name, phone });
    const token = await h.residentLogin(pgA.slug, pgA.id, phone);
    await h.req("post", "/allocations", mgr, {
      bedId,
      residentId,
      startDate: `${P0}-01`,
    });
    return { residentId, token, bedId };
  }

  async function invoicesFor(residentId: string) {
    return (
      await h.req(
        "get",
        `/invoices?residentId=${residentId}&limit=100`,
        pgA.managerToken,
      )
    ).body.items as { id: string; period: string; amountPaise: number; status: string }[];
  }

  beforeAll(async () => {
    h = await createHarness();
    pgA = await h.onboardPg("exit-settle-a");
    const mgr = pgA.managerToken;

    buildingId = await newId(
      await h.req("post", "/property/buildings", mgr, { name: "Block A" }),
    );
    floorId = await newId(
      await h.req("post", "/property/floors", mgr, { buildingId, label: "G" }),
    );
    roomId = await newId(
      await h.req("post", "/property/rooms", mgr, {
        floorId,
        label: "101",
        capacity: 20,
        monthlyRentPaise: ROOM_RENT,
      }),
    );
  }, 30000);

  afterAll(async () => {
    await h?.close();
  });

  it("generation-time: auto-settles the last billed month when the deposit fully covers it", async () => {
    const mgr = pgA.managerToken;
    const { residentId, token } = await makeResident("Gen Settle");
    await h.req("post", "/deposits", mgr, { residentId, amountPaise: ROOM_RENT });

    // Approved exit for P2 → P1 is the last billed month.
    await h.req("post", "/deposits/exit-request", token, { requestedDate: `${P2}-01` });
    const approve = await h.req(
      "post",
      `/deposits/exit-request/${residentId}/approve`,
      mgr,
    );
    expect(approve.status).toBe(201);

    // P1's invoice doesn't exist yet — this is the generation-time fold.
    const gen = await h.req("post", "/invoices/generate", mgr, { period: P1 });
    expect(gen.status).toBe(201);

    const invs = await invoicesFor(residentId);
    const p1Inv = invs.find((i) => i.period === P1);
    expect(p1Inv).toBeTruthy();
    expect(p1Inv!.status).toBe("PAID");
    expect(p1Inv!.amountPaise).toBe(ROOM_RENT);

    const dep = await h.req("get", `/deposits/resident/${residentId}`, mgr);
    expect(dep.body.availablePaise).toBe(0);
    const ded = dep.body.ledger.find((t: { invoiceId: string | null }) => t.invoiceId === p1Inv!.id);
    expect(ded).toMatchObject({ type: "DEDUCTION", amountPaise: ROOM_RENT });
  });

  it("the exit month itself (and beyond) gets no invoice at all", async () => {
    const mgr = pgA.managerToken;
    const { residentId, token } = await makeResident("Gen Skip");
    await h.req("post", "/deposits/exit-request", token, { requestedDate: `${P2}-01` });
    await h.req("post", `/deposits/exit-request/${residentId}/approve`, mgr);

    // P1 (last month) settles normally...
    await h.req("post", "/invoices/generate", mgr, { period: P1 });
    // ...but P2 (the exit month) and P0-run-again produce nothing for this resident.
    const genP2 = await h.req("post", "/invoices/generate", mgr, { period: P2 });
    expect(genP2.status).toBe(201);

    const invs = await invoicesFor(residentId);
    expect(invs.some((i) => i.period === P2)).toBe(false);
  });

  it("insufficient deposit balance: the invoice generates as normal PENDING, untouched", async () => {
    const mgr = pgA.managerToken;
    const { residentId, token } = await makeResident("Gen Insufficient");
    await h.req("post", "/deposits", mgr, {
      residentId,
      amountPaise: ROOM_RENT - 100, // just short
    });
    await h.req("post", "/deposits/exit-request", token, { requestedDate: `${P2}-01` });
    await h.req("post", `/deposits/exit-request/${residentId}/approve`, mgr);

    await h.req("post", "/invoices/generate", mgr, { period: P1 });

    const invs = await invoicesFor(residentId);
    const p1Inv = invs.find((i) => i.period === P1);
    expect(p1Inv).toBeTruthy();
    expect(p1Inv!.status).toBe("PENDING");
    expect(p1Inv!.amountPaise).toBe(ROOM_RENT);

    const dep = await h.req("get", `/deposits/resident/${residentId}`, mgr);
    expect(dep.body.availablePaise).toBe(ROOM_RENT - 100); // untouched
  });

  it("approval-time apply-now: settles a last-month invoice that already existed before approval", async () => {
    const mgr = pgA.managerToken;
    const { residentId, token } = await makeResident("Approve Apply Now");
    await h.req("post", "/deposits", mgr, { residentId, amountPaise: ROOM_RENT });

    // P1's invoice is generated BEFORE any exit request exists — a plain PENDING invoice.
    await h.req("post", "/invoices/generate", mgr, { period: P1 });
    let invs = await invoicesFor(residentId);
    let p1Inv = invs.find((i) => i.period === P1)!;
    expect(p1Inv.status).toBe("PENDING");

    // Now the resident requests + manager approves an exit for P2 → P1 becomes
    // the last month, and the already-existing P1 invoice should settle NOW.
    await h.req("post", "/deposits/exit-request", token, { requestedDate: `${P2}-01` });
    const approve = await h.req(
      "post",
      `/deposits/exit-request/${residentId}/approve`,
      mgr,
    );
    expect(approve.status).toBe(201);

    invs = await invoicesFor(residentId);
    p1Inv = invs.find((i) => i.period === P1)!;
    expect(p1Inv.status).toBe("PAID");

    const dep = await h.req("get", `/deposits/resident/${residentId}`, mgr);
    expect(dep.body.availablePaise).toBe(0);
  });

  it("apply-now is skipped when a payment is already SUBMITTED for that invoice", async () => {
    const mgr = pgA.managerToken;
    const { residentId, token } = await makeResident("Approve Skip Submitted");
    await h.req("post", "/deposits", mgr, { residentId, amountPaise: ROOM_RENT });
    await h.req("post", "/invoices/generate", mgr, { period: P1 });
    const invs = await invoicesFor(residentId);
    const p1Inv = invs.find((i) => i.period === P1)!;

    // Resident submits a UPI payment for it (SUBMITTED, awaiting manager review).
    await h.req("post", "/payments", token, {
      invoiceId: p1Inv.id,
      method: "UPI",
      amountPaise: ROOM_RENT,
      referenceId: "UTR123456",
    });

    await h.req("post", "/deposits/exit-request", token, { requestedDate: `${P2}-01` });
    await h.req("post", `/deposits/exit-request/${residentId}/approve`, mgr);

    // Still PENDING — apply-now must not fight the in-flight payment.
    const after = await invoicesFor(residentId);
    expect(after.find((i) => i.period === P1)!.status).toBe("PENDING");
    const dep = await h.req("get", `/deposits/resident/${residentId}`, mgr);
    expect(dep.body.availablePaise).toBe(ROOM_RENT); // untouched
  });

  it("cancel and update are blocked once an incoming resident's booking depends on the bed", async () => {
    const mgr = pgA.managerToken;
    const { residentId, token, bedId } = await makeResident("Booking Guard");
    await h.req("post", "/deposits/exit-request", token, { requestedDate: `${P1}-01` });
    await h.req("post", `/deposits/exit-request/${residentId}/approve`, mgr);

    const incomingId = await h.registerResident(mgr, {
      name: "Incoming",
      phone: randomPhone(),
    });
    const booking = await h.req("post", "/bookings", mgr, {
      residentId: incomingId,
      bedId,
      moveInDate: `${P1}-01`,
      depositAmountPaise: 0,
    });
    expect(booking.status).toBe(201);

    const cancel = await h.req("post", "/deposits/exit-request/cancel", token);
    expect(cancel.status).toBe(409);
    const update = await h.req("post", "/deposits/exit-request/update", token, {
      requestedDate: `${P2}-01`,
    });
    expect(update.status).toBe(409);

    const mine = await h.req("get", "/deposits/mine", token);
    expect(mine.body.exitRequest.bookingConflict).toBe(true);
  });

  it("a booking created AFTER a cancel is already pending blocks approval (409), leaving the pending action intact", async () => {
    const mgr = pgA.managerToken;
    const { residentId, token, bedId } = await makeResident("Booking Race");
    await h.req("post", "/deposits/exit-request", token, { requestedDate: `${P1}-01` });
    await h.req("post", `/deposits/exit-request/${residentId}/approve`, mgr);

    // Cancel requested BEFORE any booking exists — allowed.
    const cancel = await h.req("post", "/deposits/exit-request/cancel", token);
    expect(cancel.status).toBe(201);

    // A booking appears on the bed while the cancel is still awaiting a decision.
    const incomingId = await h.registerResident(mgr, {
      name: "Incoming Late",
      phone: randomPhone(),
    });
    await h.req("post", "/bookings", mgr, {
      residentId: incomingId,
      bedId,
      moveInDate: `${P1}-01`,
      depositAmountPaise: 0,
    });

    // Approving the now-stale cancel is rejected — the manager must resolve
    // the booking (or reject the cancel) instead.
    const approve = await h.req(
      "post",
      `/deposits/exit-request/${residentId}/approve`,
      mgr,
    );
    expect(approve.status).toBe(409);

    // The pending action is untouched — reject still works.
    const reject = await h.req(
      "post",
      `/deposits/exit-request/${residentId}/reject`,
      mgr,
    );
    expect(reject.status).toBe(201);
  });
});
