import { createHarness, randomPhone, type Harness, type TestPg } from "./harness";

/**
 * Resident login-OTP brute-force protection (B1). A 6-digit code is only safe
 * with a guess cap: after MAX_VERIFY_ATTEMPTS (5) wrong tries the code is
 * burned, so the remaining guesses in the TTL window can't be spent — even the
 * *correct* code stops working until a fresh one is requested.
 *
 * Resident login moved from phone/SMS OTP to email OTP (SMS costs money, no
 * provider was ever wired — see docs/backlog.md); this spec now exercises
 * `EmailLoginOtpService` via the same `/auth/resident/otp/*` routes.
 */
describe("resident login OTP lockout (e2e)", () => {
  let h: Harness;
  let pg: TestPg;
  let email: string;

  beforeAll(async () => {
    h = await createHarness();
    pg = await h.onboardPg("otp");
    const phone = randomPhone();
    email = `otp-lockout-${phone}@example.com`;
    await h.registerResident(pg.managerToken, { name: "OTP Res", phone, email });
  }, 30000);

  afterAll(async () => {
    await h?.close();
  });

  const verify = (code: string) =>
    h.req("post", "/auth/resident/otp/verify", undefined, {
      pgCode: pg.slug,
      email,
      code,
    });

  it("burns the code after 5 wrong attempts; the correct code then fails", async () => {
    await h.req("post", "/auth/resident/otp/request", undefined, {
      pgCode: pg.slug,
      email,
    });
    const real = await h.getEmailLoginOtp(pg.id, email);
    expect(real).toBeTruthy();
    const wrong = real === "100000" ? "100001" : "100000";

    // Five wrong guesses — each rejected; the fifth trips the cap and burns it.
    for (let i = 0; i < 5; i++) {
      const res = await verify(wrong);
      expect(res.status).toBe(401);
    }

    // The genuine code no longer works — it was invalidated by the lockout.
    const afterLock = await verify(real as string);
    expect(afterLock.status).toBe(401);
    expect(await h.getEmailLoginOtp(pg.id, email)).toBeNull();
  });

  it("a freshly requested code works (lockout is per-code, and resets)", async () => {
    await h.req("post", "/auth/resident/otp/request", undefined, {
      pgCode: pg.slug,
      email,
    });
    const code = await h.getEmailLoginOtp(pg.id, email);
    expect(code).toBeTruthy();
    const res = await verify(code as string);
    expect(res.status).toBe(201);
    expect(typeof res.body?.accessToken).toBe("string");
    expect((res.body.accessToken as string).length).toBeGreaterThan(0);
  });
});
