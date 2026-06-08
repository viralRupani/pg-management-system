import { createHarness, randomPhone, type Harness, type TestPg } from "./harness";

/**
 * Resident OTP brute-force protection (B1). A 6-digit code is only safe with a
 * guess cap: after MAX_VERIFY_ATTEMPTS (5) wrong tries the code is burned, so the
 * remaining guesses in the TTL window can't be spent — even the *correct* code
 * stops working until a fresh one is requested.
 */
describe("resident OTP lockout (e2e)", () => {
  let h: Harness;
  let pg: TestPg;
  let phone: string;

  beforeAll(async () => {
    h = await createHarness();
    pg = await h.onboardPg("otp");
    phone = randomPhone();
    await h.registerResident(pg.managerToken, { name: "OTP Res", phone });
  }, 30000);

  afterAll(async () => {
    await h?.close();
  });

  const verify = (code: string) =>
    h.req("post", "/auth/resident/otp/verify", undefined, {
      pgCode: pg.slug,
      phone,
      code,
    });

  it("burns the code after 5 wrong attempts; the correct code then fails", async () => {
    await h.req("post", "/auth/resident/otp/request", undefined, {
      pgCode: pg.slug,
      phone,
    });
    const real = await h.getOtp(pg.id, phone);
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
    expect(await h.getOtp(pg.id, phone)).toBeNull();
  });

  it("a freshly requested code works (lockout is per-code, and resets)", async () => {
    const token = await h.residentLogin(pg.slug, pg.id, phone);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });
});
