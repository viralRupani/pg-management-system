import { createHarness, type Harness, type TestPg } from "./harness";
import { UserRole } from "@pg/shared";

describe("Auth — change-password & forgot/reset-password", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  // ── Change-password (authenticated) ────────────────────────────────────────

  describe("POST /auth/change-password", () => {
    it("changes the password and the new password works for login", async () => {
      const pg = await h.onboardPg("chgpw");
      const token = await h.managerLogin(pg.managerEmail);

      const res = await h
        .req("post", "/auth/change-password", token, {
          currentPassword: "password123",
          newPassword: "newSecure!456",
        })
        .expect(201);
      // Response is now AuthTokens — fresh pair without mustChangePassword.
      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.refreshToken).toBeTruthy();

      // Old password no longer works.
      await h
        .req("post", "/auth/manager/login", undefined, {
          email: pg.managerEmail,
          password: "password123",
        })
        .expect(401);

      // New password works.
      const newToken = await h.managerLogin(pg.managerEmail, "newSecure!456");
      expect(newToken).toBeTruthy();
    });

    it("rejects wrong current password with 401", async () => {
      const pg = await h.onboardPg("chgpw-bad");
      const token = await h.managerLogin(pg.managerEmail);

      await h
        .req("post", "/auth/change-password", token, {
          currentPassword: "wrongPassword!",
          newPassword: "newSecure!789",
        })
        .expect(401);
    });

    it("rejects same-as-current new password with 400", async () => {
      const pg = await h.onboardPg("chgpw-same");
      const token = await h.managerLogin(pg.managerEmail);

      await h
        .req("post", "/auth/change-password", token, {
          currentPassword: "password123",
          newPassword: "password123",
        })
        .expect(400);
    });

    it("requires authentication — 401 without token", async () => {
      await h
        .req("post", "/auth/change-password", undefined, {
          currentPassword: "password123",
          newPassword: "newSecure!456",
        })
        .expect(401);
    });
  });

  // ── Forgot / reset password ─────────────────────────────────────────────────

  describe("POST /auth/forgot-password + POST /auth/reset-password", () => {
    it("always returns { sent: true } for an unknown email", async () => {
      await h
        .req("post", "/auth/forgot-password", undefined, {
          email: "nonexistent@example.com",
        })
        .expect(201)
        .expect({ sent: true });
    });

    it("returns { sent: true } for a known manager email", async () => {
      const pg = await h.onboardPg("frgt");

      await h
        .req("post", "/auth/forgot-password", undefined, {
          email: pg.managerEmail,
        })
        .expect(201)
        .expect({ sent: true });
    });

    it("full flow: forgot → reset → login with new password", async () => {
      const pg = await h.onboardPg("resetpw");

      await h.req("post", "/auth/forgot-password", undefined, {
        email: pg.managerEmail,
      });

      const token = await h.getPwResetToken(pg.managerEmail);
      expect(token).toBeTruthy();

      // Use the token to set a new password.
      await h
        .req("post", "/auth/reset-password", undefined, {
          token,
          newPassword: "resetNewPw!99",
        })
        .expect(201)
        .expect({ ok: true });

      // Old password no longer works.
      await h
        .req("post", "/auth/manager/login", undefined, {
          email: pg.managerEmail,
          password: "password123",
        })
        .expect(401);

      // New password works.
      const newToken = await h.managerLogin(pg.managerEmail, "resetNewPw!99");
      expect(newToken).toBeTruthy();
    });

    it("rejects a reused reset token with 401", async () => {
      const pg = await h.onboardPg("resetpw-reuse");

      await h.req("post", "/auth/forgot-password", undefined, {
        email: pg.managerEmail,
      });

      const token = await h.getPwResetToken(pg.managerEmail);
      expect(token).toBeTruthy();

      // First use succeeds.
      await h
        .req("post", "/auth/reset-password", undefined, {
          token,
          newPassword: "firstUse!1",
        })
        .expect(201);

      // Second use fails (token was consumed).
      await h
        .req("post", "/auth/reset-password", undefined, {
          token,
          newPassword: "secondUse!2",
        })
        .expect(401);
    });

    it("rejects an invalid token with 401", async () => {
      await h
        .req("post", "/auth/reset-password", undefined, {
          token: "a".repeat(64),
          newPassword: "somePassword!1",
        })
        .expect(401);
    });
  });

  // ── Force-change flag (owner-created managers) ──────────────────────────────

  describe("mustChangePassword JWT flag", () => {
    let ownerToken: string;
    let pg: TestPg;

    beforeAll(async () => {
      // Create an owner via the platform endpoint and log them in.
      const email = `owner-pwflag@example.com`;
      await h.req("post", "/platform/owners", h.platformToken(), {
        name: "PwFlag Owner",
        email,
        password: "password123",
      });
      const login = await h.req("post", "/auth/manager/login", undefined, {
        email,
        password: "password123",
      });
      const globalToken: string = login.body.accessToken;

      // Create a PG and switch to its scoped token.
      const pgRes = await h.req("post", "/owner/pgs", globalToken, {
        name: "PwFlag PG",
        slug: `pwflag-pg-${Date.now()}`,
        accentColor: "#0d9488",
      });
      const tenantId: string = pgRes.body.id;
      const switchRes = await h.req(
        "post",
        `/owner/pgs/${tenantId}/switch`,
        globalToken,
      );
      ownerToken = switchRes.body.accessToken;

      // Use onboardPg so the harness tracks the tenant for cleanup.
      pg = await h.onboardPg("pwflag-mgr");
    });

    it("owner-created manager's first login token carries mustChangePassword:true", async () => {
      const mgrEmail = `pwflag-manager@example.com`;

      // Add manager via owner endpoint (PG-scoped token).
      await h.req("post", "/owner/managers", ownerToken, {
        name: "PwFlag Mgr",
        email: mgrEmail,
        phone: "+919800000099",
        password: "tempPass!1",
      });

      // Manager logs in — token must have mustChangePassword:true.
      const loginRes = await h
        .req("post", "/auth/manager/login", undefined, {
          email: mgrEmail,
          password: "tempPass!1",
        })
        .expect(201);

      const rawPayload = JSON.parse(
        Buffer.from(
          loginRes.body.accessToken.split(".")[1],
          "base64",
        ).toString(),
      );
      expect(rawPayload.mustChangePassword).toBe(true);
      expect(rawPayload.role).toBe(UserRole.PG_MANAGER);
    });

    it("after changing password the new token has no mustChangePassword flag", async () => {
      const mgrEmail = `pwflag-clear@example.com`;

      await h.req("post", "/owner/managers", ownerToken, {
        name: "PwFlag Clear",
        email: mgrEmail,
        phone: "+919800000088",
        password: "tempPass!2",
      });

      const firstLogin = await h.req("post", "/auth/manager/login", undefined, {
        email: mgrEmail,
        password: "tempPass!2",
      });
      const firstToken: string = firstLogin.body.accessToken;

      // Change password → returns new AuthTokens.
      const chgRes = await h
        .req("post", "/auth/change-password", firstToken, {
          currentPassword: "tempPass!2",
          newPassword: "permanentPw!9",
        })
        .expect(201);

      const newPayload = JSON.parse(
        Buffer.from(
          chgRes.body.accessToken.split(".")[1],
          "base64",
        ).toString(),
      );
      expect(newPayload.mustChangePassword).toBeUndefined();

      // Subsequent login also has no flag.
      const secondLogin = await h.req("post", "/auth/manager/login", undefined, {
        email: mgrEmail,
        password: "permanentPw!9",
      });
      const secondPayload = JSON.parse(
        Buffer.from(
          secondLogin.body.accessToken.split(".")[1],
          "base64",
        ).toString(),
      );
      expect(secondPayload.mustChangePassword).toBeUndefined();
    });
  });
});
