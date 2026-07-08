import { createHarness, randomPhone, type Harness, type TestPg } from "./harness";

/**
 * Resident app-access revocation on move-out (e2e).
 *
 * When a manager ends a resident's stay, that resident must no longer be able
 * to use the mobile / web app — neither by logging in fresh nor by refreshing
 * an already-issued (30-day) token. "No longer staying" = not bed-allocated and
 * not awaiting a future move-in, so this is robust to BOTH manager actions:
 *   - "Move out" (POST /allocations/move-out) ends the allocation, leaves
 *     users.status = ACTIVE;
 *   - "Settle exit" (POST /deposits/exit) sets users.status = EXITED.
 * Both drop the resident to zero active allocations → access is revoked.
 * An UPCOMING resident (booked, not yet moved in) still gets in.
 */
describe("resident access revocation on move-out (e2e)", () => {
  let h: Harness;
  let pg: TestPg;
  let roomId: string;

  // IST-aware "first of next month" for a valid future booking move-in date.
  const istNow = new Date(Date.now() + 330 * 60_000);
  const nextMonthFirst = new Date(
    Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth() + 1, 1),
  )
    .toISOString()
    .slice(0, 10);

  async function id(res: {
    status: number;
    body: { id: string };
  }): Promise<string> {
    if (res.status !== 201 && res.status !== 200) {
      throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.id;
  }

  async function makeBed(label: string): Promise<string> {
    return id(
      await h.req("post", "/property/beds", pg.managerToken, { roomId, label }),
    );
  }

  /** Full OTP flow → the raw verify response (carries access + refresh). */
  async function otpLogin(phone: string) {
    await h.req("post", "/auth/resident/otp/request", undefined, {
      pgCode: pg.slug,
      phone,
    });
    const code = await h.getOtp(pg.id, phone);
    return h.req("post", "/auth/resident/otp/verify", undefined, {
      pgCode: pg.slug,
      phone,
      code,
    });
  }

  beforeAll(async () => {
    h = await createHarness();
    pg = await h.onboardPg("revoke");
    const mgr = pg.managerToken;

    const buildingId = await id(
      await h.req("post", "/property/buildings", mgr, { name: "Block A" }),
    );
    const floorId = await id(
      await h.req("post", "/property/floors", mgr, { buildingId, label: "G" }),
    );
    roomId = await id(
      await h.req("post", "/property/rooms", mgr, {
        floorId,
        label: "101",
        capacity: 4,
        monthlyRentPaise: 800000,
      }),
    );
  }, 30000);

  afterAll(async () => {
    await h?.close();
  });

  it("lets an active bed-allocated resident log in and refresh", async () => {
    const phone = randomPhone();
    const residentId = await h.registerResident(pg.managerToken, {
      name: "Active Res",
      phone,
    });
    const bedId = await makeBed("A1");
    expect(
      (
        await h.req("post", "/allocations", pg.managerToken, {
          bedId,
          residentId,
        })
      ).status,
    ).toBe(201);

    const login = await otpLogin(phone);
    expect(login.status).toBe(201);
    expect(login.body.accessToken).toBeTruthy();

    const refreshed = await h.req("post", "/auth/refresh", undefined, {
      refreshToken: login.body.refreshToken,
    });
    expect(refreshed.status).toBe(201);
    expect(refreshed.body.accessToken).toBeTruthy();
  });

  it("blocks login AND refresh after the manager moves the resident out", async () => {
    const phone = randomPhone();
    const residentId = await h.registerResident(pg.managerToken, {
      name: "MoveOut Res",
      phone,
    });
    const bedId = await makeBed("A2");
    await h.req("post", "/allocations", pg.managerToken, { bedId, residentId });

    // Log in while still allocated, capturing the 30-day refresh token.
    const login = await otpLogin(phone);
    expect(login.status).toBe(201);
    const refreshToken = login.body.refreshToken;

    // Manager moves them out — allocation ends, status stays ACTIVE.
    const out = await h.req("post", "/allocations/move-out", pg.managerToken, {
      residentId,
    });
    expect(out.status).toBe(201);

    // Fresh OTP login is now refused…
    const relogin = await otpLogin(phone);
    expect(relogin.status).toBe(401);
    expect(relogin.body.accessToken).toBeUndefined();

    // …and the still-valid refresh token can no longer mint access.
    const refreshed = await h.req("post", "/auth/refresh", undefined, {
      refreshToken,
    });
    expect(refreshed.status).toBe(401);
  });

  it("blocks login AND refresh after the manager settles the exit (EXITED)", async () => {
    const phone = randomPhone();
    const residentId = await h.registerResident(pg.managerToken, {
      name: "Exit Res",
      phone,
    });
    const bedId = await makeBed("A3");
    await h.req("post", "/allocations", pg.managerToken, { bedId, residentId });

    const login = await otpLogin(phone);
    expect(login.status).toBe(201);
    const refreshToken = login.body.refreshToken;

    const exit = await h.req("post", "/deposits/exit", pg.managerToken, {
      residentId,
      deductions: [],
    });
    expect(exit.status).toBe(201);

    expect((await otpLogin(phone)).status).toBe(401);
    expect(
      (
        await h.req("post", "/auth/refresh", undefined, { refreshToken })
      ).status,
    ).toBe(401);
  });

  it("still lets a freshly-registered, never-allocated resident log in", async () => {
    // Onboarding: registered, no bed yet (e.g. uploading KYC pre-allocation).
    const phone = randomPhone();
    await h.registerResident(pg.managerToken, { name: "Onboarding Res", phone });

    const login = await otpLogin(phone);
    expect(login.status).toBe(201);
    expect(login.body.accessToken).toBeTruthy();
  });

  it("blocks a never-allocated resident once their exit is settled", async () => {
    // settleExit works with no deposit + no allocation — flips them EXITED.
    // The EXITED short-circuit must fire even though they were never allocated.
    const phone = randomPhone();
    const residentId = await h.registerResident(pg.managerToken, {
      name: "Never-Alloc Exit",
      phone,
    });
    expect(
      (
        await h.req("post", "/deposits/exit", pg.managerToken, {
          residentId,
          deductions: [],
        })
      ).status,
    ).toBe(201);

    expect((await otpLogin(phone)).status).toBe(401);
  });

  it("still lets an UPCOMING (booked, not yet moved in) resident log in", async () => {
    const phone = randomPhone();
    const residentId = await h.registerResident(pg.managerToken, {
      name: "Upcoming Res",
      phone,
    });
    const bedId = await makeBed("A4");
    // Book a future move-in → resident UPCOMING, bed RESERVED, no allocation yet.
    const booking = await h.req("post", "/bookings", pg.managerToken, {
      residentId,
      bedId,
      moveInDate: nextMonthFirst,
      depositAmountPaise: 1500000,
    });
    expect(booking.status).toBe(201);

    const login = await otpLogin(phone);
    expect(login.status).toBe(201);
    expect(login.body.accessToken).toBeTruthy();
  });
});
