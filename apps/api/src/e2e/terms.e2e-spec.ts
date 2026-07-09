import { inArray } from "drizzle-orm";
import * as argon2 from "argon2";
import { UserRole } from "@pg/shared";
import { PLATFORM_DB, type Database } from "../db/database.module";
import { authIdentities, owners, tcAcceptances, tcVersions, tenants } from "../db/schema";
import { createHarness, type Harness } from "./harness";

/**
 * Terms & Conditions acceptance gate (e2e). Covers all four token states over
 * real HTTP:
 *  1. Manager (PG-scoped): status starts unaccepted → accept flips it → accept
 *     is idempotent.
 *  2. Owner on the GLOBAL token accepts.
 *  3. Owner on a PG-SCOPED token: status returns accepted:true and does NOT 401
 *     (fail-open — the in-PG PG_OWNER user row has no credential, and a 401 here
 *     would trip the api-client → /login redirect loop after switchPg).
 *  4. Publishing a NEW version re-prompts a previously-accepted user.
 *  5. Only PLATFORM_ADMIN may publish (owner/manager get 403).
 *
 * tc_* tables are GLOBAL (no RLS), so every assertion is relative to the
 * version we publish in-test — never an absolute version number. Versions this
 * run publishes are tracked in `createdVersions` and deleted in `afterAll` — a
 * real dev/admin session reads `max(version)` as "the" terms, so a leftover
 * test version otherwise becomes what the T&C gate shows outside the suite.
 * Needs infra up + migrated. Run serialized (the suite shares one Postgres).
 */
describe("Terms & Conditions (e2e)", () => {
  let h: Harness;
  let platformDb: Database;
  const createdOwnerEmails: string[] = [];
  const seededAdminEmails: string[] = [];
  const createdTenantIds: string[] = []; // owner-created PGs (not in harness cleanup)
  const createdVersions: number[] = [];
  let suffix: string;

  beforeAll(async () => {
    h = await createHarness();
    platformDb = h.app.get<Database>(PLATFORM_DB);
    suffix = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  });

  afterAll(async () => {
    if (createdVersions.length) {
      await platformDb
        .delete(tcAcceptances)
        .where(inArray(tcAcceptances.version, createdVersions));
      await platformDb.delete(tcVersions).where(inArray(tcVersions.version, createdVersions));
    }
    if (createdTenantIds.length) {
      await platformDb.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    }
    if (createdOwnerEmails.length) {
      await platformDb
        .delete(authIdentities)
        .where(inArray(authIdentities.email, createdOwnerEmails));
      await platformDb
        .delete(owners)
        .where(inArray(owners.email, createdOwnerEmails));
    }
    if (seededAdminEmails.length) {
      await platformDb
        .delete(authIdentities)
        .where(inArray(authIdentities.email, seededAdminEmails));
    }
    await h.close();
  });

  /**
   * Seed a REAL platform-admin credential (tenantId null, userId null) and log it
   * in through the actual `POST /auth/manager/login` path — exactly what plan §4
   * adds. Distinct from the harness's synthetic `platformToken()` (random sub, no
   * DB row), which can't exercise login or the `publishedByEmail` resolution.
   */
  async function seedPlatformAdmin(
    label: string,
  ): Promise<{ email: string; token: string }> {
    const email = `tc-admin-${label}-${suffix}@example.com`;
    seededAdminEmails.push(email);
    await platformDb.insert(authIdentities).values({
      tenantId: null,
      role: UserRole.PLATFORM_ADMIN,
      userId: null,
      email,
      passwordHash: await argon2.hash("password123"),
      mustChangePassword: false,
    });
    const login = await h.req("post", "/auth/manager/login", undefined, {
      email,
      password: "password123",
    });
    expect(login.status).toBe(201);
    return { email, token: login.body.accessToken };
  }

  /** Publish a fresh version as the platform admin; returns its version number. */
  async function publish(body: string): Promise<number> {
    const res = await h.req("post", "/terms/versions", h.platformToken(), { body });
    expect(res.status).toBe(201);
    createdVersions.push(res.body.version);
    return res.body.version as number;
  }

  /** Platform admin creates an owner; returns email + global access token + id. */
  async function makeOwner(label: string): Promise<{ email: string; token: string }> {
    const email = `tc-owner-${label}-${suffix}@example.com`;
    createdOwnerEmails.push(email);
    const created = await h.req("post", "/platform/owners", h.platformToken(), {
      name: `Owner ${label}`,
      email,
      password: "password123",
    });
    expect(created.status).toBe(201);
    const login = await h.req("post", "/auth/manager/login", undefined, {
      email,
      password: "password123",
    });
    expect(login.status).toBe(201);
    return { email, token: login.body.accessToken };
  }

  it("manager accepts, is idempotent, and is re-prompted on a new version", async () => {
    const pg = await h.onboardPg("tcmgr");
    const versionA = await publish(
      "Version A — you are responsible for rent, deposits, and disputes. ".repeat(2),
    );

    // Starts unaccepted; body + version come back in one call.
    let status = await h.req("get", "/terms/status", pg.managerToken);
    expect(status.status).toBe(200);
    expect(status.body.latestVersion).toBe(versionA);
    expect(status.body.accepted).toBe(false);
    expect(typeof status.body.body).toBe("string");

    // Accept → flips to accepted.
    const accept = await h.req("post", "/terms/accept", pg.managerToken, {
      version: versionA,
    });
    expect(accept.status).toBe(201);
    expect(accept.body.accepted).toBe(true);

    status = await h.req("get", "/terms/status", pg.managerToken);
    expect(status.body.accepted).toBe(true);

    // Re-accept is idempotent (unique index → no-op).
    const again = await h.req("post", "/terms/accept", pg.managerToken, {
      version: versionA,
    });
    expect(again.status).toBe(201);
    status = await h.req("get", "/terms/status", pg.managerToken);
    expect(status.body.accepted).toBe(true);

    // Publishing a new version supersedes the prior acceptance → re-prompted.
    const versionB = await publish(
      "Version B — service availability is not guaranteed; secure your account. ".repeat(2),
    );
    expect(versionB).toBe(versionA + 1);
    status = await h.req("get", "/terms/status", pg.managerToken);
    expect(status.body.latestVersion).toBe(versionB);
    expect(status.body.accepted).toBe(false);
  });

  it("owner accepts on the global token; PG-scoped status fails open (no 401)", async () => {
    const owner = await makeOwner("g");

    // Owner creates a PG so we can switch into a PG-scoped token later.
    const pg = await h.req("post", "/owner/pgs", owner.token, {
      name: "TC Owner PG",
      slug: `tcownerpg-${suffix}`,
      accentColor: "#0d9488",
    });
    expect(pg.status).toBe(201);
    createdTenantIds.push(pg.body.id);

    const version = await publish(
      "Version for owner — platform is only a management tool, not a party. ".repeat(2),
    );

    // Global token: unaccepted → accept → accepted.
    let status = await h.req("get", "/terms/status", owner.token);
    expect(status.status).toBe(200);
    expect(status.body.latestVersion).toBe(version);
    expect(status.body.accepted).toBe(false);

    const accept = await h.req("post", "/terms/accept", owner.token, { version });
    expect(accept.status).toBe(201);
    status = await h.req("get", "/terms/status", owner.token);
    expect(status.body.accepted).toBe(true);

    // Switch into the PG → PG-scoped token. The in-PG PG_OWNER user row has no
    // credential, so status must FAIL OPEN: 200, accepted:true, latestVersion
    // null — never 401 (which would loop the api-client back to /login).
    const sw = await h.req("post", `/owner/pgs/${pg.body.id}/switch`, owner.token);
    expect(sw.status).toBe(201);
    const scoped = sw.body.accessToken;

    const scopedStatus = await h.req("get", "/terms/status", scoped);
    expect(scopedStatus.status).toBe(200);
    expect(scopedStatus.body.accepted).toBe(true);
    expect(scopedStatus.body.latestVersion).toBeNull();

    // Accepting on the PG-scoped token (credential unresolvable) is a clean 400,
    // never an insert with a null authIdentityId. `version` is the current latest
    // (so this passes the 409 stale-version check and reaches the guard).
    const scopedAccept = await h.req("post", "/terms/accept", scoped, { version });
    expect(scopedAccept.status).toBe(400);
  });

  it("logs a real PLATFORM_ADMIN in via /auth/manager/login and stamps the audit email", async () => {
    const admin = await seedPlatformAdmin("real");

    // The login path (plan §4) mints a null-tenant PLATFORM_ADMIN token with no
    // AuthService change.
    const payload = JSON.parse(
      Buffer.from(admin.token.split(".")[1], "base64").toString(),
    );
    expect(payload.role).toBe(UserRole.PLATFORM_ADMIN);
    expect(payload.tenantId).toBeNull();

    // Publishing with the real credential resolves publishedByEmail from it.
    const res = await h.req("post", "/terms/versions", admin.token, {
      body: "Published by a real platform admin credential. ".repeat(3),
    });
    expect(res.status).toBe(201);
    createdVersions.push(res.body.version);
    expect(res.body.publishedByEmail).toBe(admin.email);
  });

  it("rejects a stale accept (version ≠ current latest) with 409", async () => {
    const pg = await h.onboardPg("tcstale");
    const version = await publish("Version for stale check. ".repeat(3));
    const res = await h.req("post", "/terms/accept", pg.managerToken, {
      version: version + 100, // not the current latest
    });
    expect(res.status).toBe(409);
  });

  it("lets only PLATFORM_ADMIN publish (owner + manager get 403)", async () => {
    const pg = await h.onboardPg("tcpub");
    const owner = await makeOwner("h");

    const body = { body: "Attempted publish by a non-admin principal. ".repeat(3) };
    expect((await h.req("post", "/terms/versions", pg.managerToken, body)).status).toBe(403);
    expect((await h.req("post", "/terms/versions", owner.token, body)).status).toBe(403);
    const created = await h.req("post", "/terms/versions", h.platformToken(), body);
    expect(created.status).toBe(201);
    createdVersions.push(created.body.version);

    // Platform admin can list versions; a manager cannot.
    expect((await h.req("get", "/terms/versions", h.platformToken())).status).toBe(200);
    expect((await h.req("get", "/terms/versions", pg.managerToken)).status).toBe(403);
  });
});
