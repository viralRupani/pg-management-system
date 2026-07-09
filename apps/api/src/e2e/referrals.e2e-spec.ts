import { randomUUID } from "node:crypto";
import { createHarness, randomPhone, type Harness, type TestPg } from "./harness";
import { istPeriod } from "../common/ist-date";
import { prorateSegment } from "../rent/rent.proration";

/**
 * Refer & earn e2e. The discount is earned when the REFERRED resident is
 * actually allocated a bed (immediate move-in or a booking activating), not
 * at registration — and only when the PG has a configured discount amount.
 * It's applied exactly once, on the referrer's next invoice, via the same
 * fold-into-`newTotal` engine as rent_adjustments/extra_charges. Dates are
 * computed dynamically (`istPeriod(new Date())`) rather than hardcoded, so
 * this suite doesn't rot as the calendar moves (see charges.e2e-spec.ts /
 * invoice-delete.e2e-spec.ts for the landmine this avoids).
 */
describe("refer & earn (e2e)", () => {
  let h: Harness;

  async function newId(res: {
    status: number;
    body: { id: string };
  }): Promise<string> {
    if (res.status !== 201 && res.status !== 200)
      throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.id;
  }

  // One building/floor/room/bed; returns the bed id.
  async function makeBed(mgr: string, monthlyRentPaise: number): Promise<string> {
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

  // IST-aware "today" (YYYY-MM-DD) — mirrors bookings.e2e-spec.ts's helper.
  function today(): string {
    return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  }

  beforeAll(async () => {
    h = await createHarness();
  }, 30000);

  afterAll(async () => {
    await h?.close();
  });

  it("rejects a short-stay guest recorded as a referral", async () => {
    const pg = await h.onboardPg("refer-shortstay");
    const mgr = pg.managerToken;
    const referrerId = await h.registerResident(mgr, {
      name: "Referrer",
      phone: randomPhone(),
    });
    const res = await h.req("post", "/residents", mgr, {
      name: "Short Stay Guest",
      phone: randomPhone(),
      isShortStay: true,
      expectedMoveInDate: today(),
      shortStayCheckOutDate: today(),
      shortStayPerDayChargePaise: 30000,
      referredByUserId: referrerId,
    });
    expect(res.status).toBe(400);
  });

  it("rejects a nonexistent referrer", async () => {
    const pg = await h.onboardPg("refer-404");
    const mgr = pg.managerToken;
    const res = await h.req("post", "/residents", mgr, {
      name: "New Resident",
      phone: randomPhone(),
      age: 25,
      referredByUserId: randomUUID(),
    });
    expect(res.status).toBe(404);
  });

  it("does not qualify a referral when the PG has no discount configured", async () => {
    const pg = await h.onboardPg("refer-noconfig");
    const mgr = pg.managerToken;
    const referrerId = await h.registerResident(mgr, {
      name: "Referrer",
      phone: randomPhone(),
    });
    const referredId = await h.registerResident(mgr, {
      name: "Referred",
      phone: randomPhone(),
      referredByUserId: referrerId,
    });
    const bedId = await makeBed(mgr, 500000);
    const alloc = await h.req("post", "/allocations", mgr, { bedId, residentId: referredId });
    expect(alloc.status).toBe(201);

    const list = await h.req("get", `/referrals?residentId=${referrerId}`, mgr);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(0);
  });

  it(
    "qualifies on immediate allocation, is untouched by a transfer, folds " +
      "into the referrer's next invoice exactly once, and un-applies on void",
    async () => {
      const pg = await h.onboardPg("refer-full");
      const mgr = pg.managerToken;
      const DISCOUNT = 50000; // ₹500
      const RENT = 800000; // ₹8000

      const settings = await h.req("put", "/referrals/settings", mgr, {
        discountPaise: DISCOUNT,
      });
      expect(settings.status).toBe(200);
      expect(settings.body.discountPaise).toBe(DISCOUNT);

      // Referrer, allocated first.
      const referrerBed = await makeBed(mgr, RENT);
      const referrerId = await h.registerResident(mgr, {
        name: "Referrer",
        phone: randomPhone(),
      });
      const referrerAlloc = await h.req("post", "/allocations", mgr, {
        bedId: referrerBed,
        residentId: referrerId,
      });
      expect(referrerAlloc.status).toBe(201);

      // Referred resident, registered with referredByUserId, then allocated —
      // THIS is the earn moment, not registration.
      const referredBed = await makeBed(mgr, 400000);
      const referredId = await h.registerResident(mgr, {
        name: "Referred",
        phone: randomPhone(),
        referredByUserId: referrerId,
      });
      const preAllocList = await h.req(
        "get",
        `/referrals?residentId=${referrerId}`,
        mgr,
      );
      expect(preAllocList.body).toHaveLength(0); // registered, not yet earned

      const referredAlloc = await h.req("post", "/allocations", mgr, {
        bedId: referredBed,
        residentId: referredId,
      });
      expect(referredAlloc.status).toBe(201);

      let list = await h.req("get", `/referrals?residentId=${referrerId}`, mgr);
      expect(list.body).toHaveLength(1);
      expect(list.body[0].discountPaise).toBe(DISCOUNT);
      expect(list.body[0].appliedToInvoiceId).toBeNull();

      // A room transfer of the (already-active, already-qualified) referred
      // resident is a different lifecycle event — must NOT re-qualify or
      // double-count.
      const transferBed = await makeBed(mgr, 400000);
      const createTransfer = await h.req("post", "/allocations/transfers", mgr, {
        residentId: referredId,
        toBedId: transferBed,
        plannedDate: today(),
      });
      expect(createTransfer.status).toBe(201);
      const execTransfer = await h.req(
        "post",
        `/allocations/transfers/${createTransfer.body.id}/execute`,
        mgr,
        { moveDate: today() },
      );
      expect(execTransfer.status).toBe(201);

      list = await h.req("get", `/referrals?residentId=${referrerId}`, mgr);
      expect(list.body).toHaveLength(1); // still exactly one

      // Generate this period's invoices.
      const period = istPeriod(new Date());
      const gen = await h.req("post", "/invoices/generate", mgr, { period });
      expect(gen.status).toBe(201);

      const invoicesRes = await h.req(
        "get",
        `/invoices?residentId=${referrerId}&limit=100`,
        mgr,
      );
      const inv = invoicesRes.body.items.find((i: { period: string }) => i.period === period);
      expect(inv).toBeTruthy();
      const baseRent = prorateSegment(RENT, new Date(), null, period);
      expect(inv.amountPaise).toBe(baseRent - DISCOUNT);

      const breakdown = await h.req("get", `/invoices/${inv.id}/charges`, mgr);
      expect(breakdown.status).toBe(200);
      const referralLine = breakdown.body.find(
        (c: { label: string }) => c.label === "Referral discount",
      );
      expect(referralLine).toBeTruthy();
      expect(referralLine.amountPaise).toBe(-DISCOUNT);

      list = await h.req("get", `/referrals?residentId=${referrerId}`, mgr);
      expect(list.body[0].appliedToInvoiceId).toBe(inv.id);
      expect(list.body[0].appliedAt).toBeTruthy();

      // Idempotent: re-running generation must not double-apply the discount.
      const gen2 = await h.req("post", "/invoices/generate", mgr, { period });
      expect(gen2.status).toBe(201);
      const invoicesRes2 = await h.req(
        "get",
        `/invoices?residentId=${referrerId}&limit=100`,
        mgr,
      );
      const periodInvoices = invoicesRes2.body.items.filter(
        (i: { period: string }) => i.period === period,
      );
      expect(periodInvoices).toHaveLength(1);
      expect(periodInvoices[0].amountPaise).toBe(baseRent - DISCOUNT);

      // Voiding the invoice releases the referral back to unapplied.
      const del = await h.req("post", `/invoices/${inv.id}/delete`, mgr, {
        reason: "test void",
      });
      expect(del.body.deletedAt).toBeTruthy();
      list = await h.req("get", `/referrals?residentId=${referrerId}`, mgr);
      expect(list.body[0].appliedToInvoiceId).toBeNull();
      expect(list.body[0].appliedAt).toBeNull();
    },
  );

  it("qualifies when the referred resident's booking activates (not just an immediate move-in)", async () => {
    const pg = await h.onboardPg("refer-booking");
    const mgr = pg.managerToken;
    await h.req("put", "/referrals/settings", mgr, { discountPaise: 30000 });

    const referrerBed = await makeBed(mgr, 700000);
    const referrerId = await h.registerResident(mgr, {
      name: "Referrer",
      phone: randomPhone(),
    });
    await h.req("post", "/allocations", mgr, { bedId: referrerBed, residentId: referrerId });

    const referredBed = await makeBed(mgr, 400000);
    const referredId = await h.registerResident(mgr, {
      name: "Referred Booking",
      phone: randomPhone(),
      referredByUserId: referrerId,
    });
    const booked = await h.req("post", "/bookings", mgr, {
      residentId: referredId,
      bedId: referredBed,
      moveInDate: today(),
      depositAmountPaise: 0,
    });
    expect(booked.status).toBe(201);

    // Not yet earned — the booking hasn't activated into an allocation.
    let list = await h.req("get", `/referrals?residentId=${referrerId}`, mgr);
    expect(list.body).toHaveLength(0);

    const run = await h.req("post", "/platform/jobs/activate-bookings", h.platformToken());
    expect(run.status).toBe(201);

    list = await h.req("get", `/referrals?residentId=${referrerId}`, mgr);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].appliedToInvoiceId).toBeNull();
  });
});
