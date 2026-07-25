import {
  createHarness,
  randomPhone,
  type Harness,
  type TestPg,
} from "./harness";

/**
 * Resident email verification gate. Email is the interim resident notification
 * channel (until real push infra), so:
 *   - a long-term resident MUST provide an email at registration,
 *   - that email must be verified via an emailed OTP before a bed can be
 *     allocated or booked,
 *   - short-stay guests are exempt (no email, no gate).
 *
 * The OTP is read from Redis (the console mail stub doesn't expose it), mirroring
 * the phone-OTP test approach. Cross-tenant isolation is asserted too.
 */
describe("email verification (e2e)", () => {
  let h: Harness;
  let pgA: TestPg;
  let pgB: TestPg;

  async function newId(res: {
    status: number;
    body: { id: string };
  }): Promise<string> {
    if (res.status !== 201 && res.status !== 200)
      throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.id;
  }

  // One building/floor/room/bed under the given manager; returns the bed id.
  async function makeBed(mgr: string): Promise<string> {
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
        monthlyRentPaise: 500000,
      }),
    );
    return newId(
      await h.req("post", "/property/beds", mgr, { roomId, label: "A" }),
    );
  }

  beforeAll(async () => {
    h = await createHarness();
    pgA = await h.onboardPg("email-verify-a");
    pgB = await h.onboardPg("email-verify-b");
  }, 30000);

  afterAll(async () => {
    await h?.close();
  });

  it("rejects a long-term resident registered without an email (400)", async () => {
    const res = await h.req("post", "/residents", pgA.managerToken, {
      name: "No Email",
      phone: randomPhone(),
      age: 25,
    });
    expect(res.status).toBe(400);
  });

  it("blocks allocation until the email is verified, then allows it", async () => {
    const mgr = pgA.managerToken;
    // skipEmailVerify: keep the resident UNVERIFIED so we can assert the gate.
    const residentId = await h.registerResident(mgr, {
      name: "Unverified",
      phone: randomPhone(),
      email: "unverified@example.com",
      skipEmailVerify: true,
    });
    const bedId = await makeBed(mgr);

    // Not yet verified → allocation is refused (409).
    const blocked = await h.req("post", "/allocations", mgr, {
      bedId,
      residentId,
    });
    expect(blocked.status).toBe(409);

    // ...and so is a booking (send a fully valid body so the 409 is the gate,
    // not a 400 from schema validation).
    const nm = new Date();
    nm.setMonth(nm.getMonth() + 1);
    const nextMonthFirst = `${nm.getFullYear()}-${String(nm.getMonth() + 1).padStart(2, "0")}-01`;
    const blockedBooking = await h.req("post", "/bookings", mgr, {
      bedId,
      residentId,
      moveInDate: nextMonthFirst,
      depositAmountPaise: 1500000,
    });
    expect(blockedBooking.status).toBe(409);

    // Wrong code doesn't verify.
    await h.req("post", `/residents/${residentId}/email/verify/request`, mgr);
    const wrong = await h.req(
      "post",
      `/residents/${residentId}/email/verify`,
      mgr,
      { code: "000000" },
    );
    expect(wrong.status).toBe(422);

    // Real code from Redis verifies.
    const code = await h.getEmailOtp(pgA.id, residentId);
    expect(code).toMatch(/^\d{6}$/);
    const ok = await h.req(
      "post",
      `/residents/${residentId}/email/verify`,
      mgr,
      { code },
    );
    expect(ok.status).toBe(201);

    // Reflected on the resident summary.
    const summary = await h.req("get", `/residents/${residentId}`, mgr);
    expect(summary.body.emailVerified).toBe(true);

    // Now allocation succeeds.
    const allowed = await h.req("post", "/allocations", mgr, {
      bedId,
      residentId,
    });
    expect(allowed.status).toBe(201);
  });

  it("editing the email resets verification (recovery from a typo)", async () => {
    const mgr = pgA.managerToken;
    const residentId = await h.registerResident(mgr, {
      name: "Typo Fix",
      phone: randomPhone(),
      email: "typo@example.com",
    });
    // Auto-verified by the helper.
    const before = await h.req("get", `/residents/${residentId}`, mgr);
    expect(before.body.emailVerified).toBe(true);

    // Correct the address → verification resets.
    const patched = await h.req("patch", `/residents/${residentId}/email`, mgr, {
      email: "corrected@example.com",
    });
    expect(patched.status).toBe(200);
    const after = await h.req("get", `/residents/${residentId}`, mgr);
    expect(after.body.email).toBe("corrected@example.com");
    expect(after.body.emailVerified).toBe(false);

    // Re-verify the new address and it sticks.
    await h.verifyResidentEmail(mgr, residentId);
    const reverified = await h.req("get", `/residents/${residentId}`, mgr);
    expect(reverified.body.emailVerified).toBe(true);
  });

  it("rejects a malformed email on update (400)", async () => {
    const mgr = pgA.managerToken;
    const residentId = await h.registerResident(mgr, {
      name: "Bad Update",
      phone: randomPhone(),
      email: "ok@example.com",
      skipEmailVerify: true,
    });
    const res = await h.req("patch", `/residents/${residentId}/email`, mgr, {
      email: "not-an-email",
    });
    expect(res.status).toBe(400);
  });

  it("allows a short-stay guest to be assigned a bed without email verification", async () => {
    const mgr = pgA.managerToken;
    const bedId = await makeBed(mgr);
    const guestId = await h.registerResident(mgr, {
      name: "Short Guest",
      phone: randomPhone(),
      isShortStay: true,
      expectedMoveInDate: "2999-01-01",
      shortStayCheckOutDate: "2999-01-05",
      shortStayPerDayChargePaise: 30000,
    });
    const assigned = await h.req("post", "/short-stays", mgr, {
      residentId: guestId,
      bedId,
    });
    expect(assigned.status).toBe(201);
  });

  it("won't request an OTP for a short-stay guest (409)", async () => {
    const mgr = pgA.managerToken;
    const guestId = await h.registerResident(mgr, {
      name: "Short Guest 2",
      phone: randomPhone(),
      isShortStay: true,
      expectedMoveInDate: "2999-02-01",
      shortStayCheckOutDate: "2999-02-05",
      shortStayPerDayChargePaise: 30000,
    });
    const res = await h.req(
      "post",
      `/residents/${guestId}/email/verify/request`,
      mgr,
    );
    expect(res.status).toBe(409);
  });

  it("hides another tenant's resident from the verify routes (404)", async () => {
    const residentId = await h.registerResident(pgA.managerToken, {
      name: "Tenant A Resident",
      phone: randomPhone(),
      email: "tenant-a@example.com",
      skipEmailVerify: true,
    });
    // PG B's manager cannot request/verify against PG A's resident — RLS hides
    // the row, so the resident-existence check throws 404.
    const reqRes = await h.req(
      "post",
      `/residents/${residentId}/email/verify/request`,
      pgB.managerToken,
    );
    expect(reqRes.status).toBe(404);
    const verifyRes = await h.req(
      "post",
      `/residents/${residentId}/email/verify`,
      pgB.managerToken,
      { code: "123456" },
    );
    expect(verifyRes.status).toBe(404);
  });
});
