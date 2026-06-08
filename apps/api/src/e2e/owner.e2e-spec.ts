import { inArray } from "drizzle-orm";
import { UserRole } from "@pg/shared";
import { PLATFORM_DB, type Database } from "../db/database.module";
import { authIdentities, owners, tenants } from "../db/schema";
import { createHarness, type Harness } from "./harness";

/**
 * PG-owner e2e. Exercises the whole owner lifecycle over real HTTP:
 *  - platform admin creates an owner; owner logs in → GLOBAL token (no tenant);
 *  - owner creates PGs and lists exactly their own;
 *  - switch → PG-SCOPED token; the owner can do manager work (role hierarchy)
 *    AND stamp actor FKs (proves the per-tenant PG_OWNER user row exists);
 *  - owner adds / lists / deactivates managers (soft: row kept, login revoked);
 *  - cross-owner isolation + one-directional hierarchy (manager ≠ owner).
 *
 * Needs infra up + migrated. Run serialized (the suite shares one Postgres).
 */
describe("PG owner (e2e)", () => {
  let h: Harness;
  let platformDb: Database;
  const createdOwnerEmails: string[] = [];
  // Owner-created PGs go through POST /owner/pgs, so they're NOT in the harness's
  // own cleanup list — track + delete them here so the shared DB doesn't grow.
  const createdTenantIds: string[] = [];
  let suffix: string;

  /** Create a PG as an owner and remember its id for teardown. */
  async function createPg(token: string, body: Record<string, unknown>) {
    const res = await h.req("post", "/owner/pgs", token, body);
    if (res.status === 201) createdTenantIds.push(res.body.id);
    return res;
  }

  beforeAll(async () => {
    h = await createHarness();
    platformDb = h.app.get<Database>(PLATFORM_DB);
    suffix = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  });

  afterAll(async () => {
    if (createdTenantIds.length) {
      await platformDb
        .delete(tenants)
        .where(inArray(tenants.id, createdTenantIds));
    }
    // Owners + their tenant-less credentials don't cascade from tenant deletion.
    if (createdOwnerEmails.length) {
      await platformDb
        .delete(authIdentities)
        .where(inArray(authIdentities.email, createdOwnerEmails));
      await platformDb
        .delete(owners)
        .where(inArray(owners.email, createdOwnerEmails));
    }
    await h.close();
  });

  /** Platform admin creates an owner; returns email + global access token. */
  async function makeOwner(label: string): Promise<{ email: string; token: string; id: string }> {
    const email = `owner-${label}-${suffix}@example.com`;
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
    return { email, token: login.body.accessToken, id: created.body.id };
  }

  it("owner login yields a global token (PG_OWNER, no tenant)", async () => {
    const owner = await makeOwner("a");
    const payload = JSON.parse(
      Buffer.from(owner.token.split(".")[1], "base64").toString(),
    );
    expect(payload.role).toBe(UserRole.PG_OWNER);
    expect(payload.tenantId).toBeNull();
    expect(payload.sub).toBe(owner.id);
  });

  it("runs the full create → list → switch → manage flow", async () => {
    const owner = await makeOwner("b");

    // Create two PGs (one with a slug only, one with an inline first manager).
    const pgA = await createPg(owner.token, {
      name: "Owner B PG One",
      slug: `obp1-${suffix}`,
      accentColor: "#123456",
    });
    expect(pgA.status).toBe(201);
    const pgB = await createPg(owner.token, {
      name: "Owner B PG Two",
      slug: `obp2-${suffix}`,
      manager: {
        name: "Seed Manager",
        email: `seedmgr-${suffix}@example.com`,
        password: "password123",
        phone: "+919811111111",
      },
    });
    expect(pgB.status).toBe(201);
    const tenantIds = [pgA.body.id, pgB.body.id];

    // listPgs returns exactly the owner's two PGs.
    const list = await h.req("get", "/owner/pgs", owner.token);
    expect(list.status).toBe(200);
    const listedIds = list.body.map((p: { id: string }) => p.id).sort();
    expect(listedIds).toEqual([...tenantIds].sort());

    // Switch into PG A → PG-scoped token.
    const sw = await h.req("post", `/owner/pgs/${pgA.body.id}/switch`, owner.token);
    expect(sw.status).toBe(201);
    const scoped = sw.body.accessToken;
    const scopedPayload = JSON.parse(
      Buffer.from(scoped.split(".")[1], "base64").toString(),
    );
    expect(scopedPayload.role).toBe(UserRole.PG_OWNER);
    expect(scopedPayload.tenantId).toBe(pgA.body.id);
    // sub is the per-tenant PG_OWNER user row, NOT the global owner id.
    expect(scopedPayload.sub).not.toBe(owner.id);

    // Role hierarchy: owner can hit a manager-only endpoint.
    const residents = await h.req("get", "/residents", scoped);
    expect(residents.status).toBe(200);

    // Actor FK resolves: posting an announcement stamps createdByUserId = sub,
    // which is a composite FK into users(id, tenant_id). A 201 proves the
    // owner's per-tenant PG_OWNER user row exists.
    const ann = await h.req("post", "/announcements", scoped, {
      title: "Owner notice",
      body: "Posted by the owner acting in PG A.",
    });
    expect(ann.status).toBe(201);

    // --- manager management (scoped owner token) ---
    const mgrEmail = `addedmgr-${suffix}@example.com`;
    const added = await h.req("post", "/owner/managers", scoped, {
      name: "Added Manager",
      email: mgrEmail,
      password: "password123",
      phone: "+919822222222",
    });
    expect(added.status).toBe(201);
    const managerId = added.body.id;

    // The added manager can log in (capture BOTH tokens to test revocation) and
    // lands in PG A only.
    const mgrLogin = await h.req("post", "/auth/manager/login", undefined, {
      email: mgrEmail,
      password: "password123",
    });
    expect(mgrLogin.status).toBe(201);
    const mgrToken = mgrLogin.body.accessToken;
    const mgrRefresh = mgrLogin.body.refreshToken;
    const mgrPayload = JSON.parse(
      Buffer.from(mgrToken.split(".")[1], "base64").toString(),
    );
    expect(mgrPayload.tenantId).toBe(pgA.body.id);
    expect(mgrPayload.role).toBe(UserRole.PG_MANAGER);

    // listManagers includes the seed + added managers (both active).
    const managers = await h.req("get", "/owner/managers", scoped);
    expect(managers.status).toBe(200);
    const added1 = managers.body.find((m: { id: string }) => m.id === managerId);
    expect(added1).toBeDefined();
    expect(added1.deactivatedAt).toBeNull();

    // A plain manager CANNOT manage managers (hierarchy is one-way).
    expect((await h.req("get", "/owner/managers", mgrToken)).status).toBe(403);
    expect(
      (
        await h.req("post", "/owner/managers", mgrToken, {
          name: "X",
          email: `x-${suffix}@example.com`,
          password: "password123",
          phone: "+919833333333",
        })
      ).status,
    ).toBe(403);

    // Deactivate the added manager: login revoked, but the row survives.
    const del = await h.req("delete", `/owner/managers/${managerId}`, scoped);
    expect([200, 204]).toContain(del.status);

    const afterLogin = await h.req("post", "/auth/manager/login", undefined, {
      email: mgrEmail,
      password: "password123",
    });
    expect(afterLogin.status).toBe(401); // credential gone

    // …and the still-valid refresh token can no longer mint access (revocation
    // takes effect at refresh, not just at password login).
    const afterRefresh = await h.req("post", "/auth/refresh", undefined, {
      refreshToken: mgrRefresh,
    });
    expect(afterRefresh.status).toBe(401);

    const after = await h.req("get", "/owner/managers", scoped);
    const stillThere = after.body.find((m: { id: string }) => m.id === managerId);
    expect(stillThere).toBeDefined(); // user row kept (audit trail intact)
    expect(stillThere.deactivatedAt).not.toBeNull();
  });

  it("enforces cross-owner isolation", async () => {
    const owner1 = await makeOwner("c");
    const owner2 = await makeOwner("d");

    const pg1 = await createPg(owner1.token, {
      name: "Owner C PG",
      slug: `ocp-${suffix}`,
    });
    expect(pg1.status).toBe(201);
    const pg2 = await createPg(owner2.token, {
      name: "Owner D PG",
      slug: `odp-${suffix}`,
    });
    expect(pg2.status).toBe(201);

    // owner2 cannot see owner1's PG…
    const owner2List = await h.req("get", "/owner/pgs", owner2.token);
    const owner2Ids = owner2List.body.map((p: { id: string }) => p.id);
    expect(owner2Ids).toContain(pg2.body.id);
    expect(owner2Ids).not.toContain(pg1.body.id);

    // …and cannot switch into it.
    const steal = await h.req(
      "post",
      `/owner/pgs/${pg1.body.id}/switch`,
      owner2.token,
    );
    expect(steal.status).toBe(403);
  });

  it("rejects in-PG owner routes without an active PG (global token)", async () => {
    const owner = await makeOwner("e");
    // Global token has no tenant context → manager management must 400, not 500.
    const res = await h.req("get", "/owner/managers", owner.token);
    expect(res.status).toBe(400);
  });

  it("blocks a manager from owner routes and a plain user from creating owners", async () => {
    const pg = await h.onboardPg("ownerguard");
    // A standalone manager is not an owner.
    expect((await h.req("get", "/owner/pgs", pg.managerToken)).status).toBe(403);
    // Only the platform admin can create owners.
    expect(
      (
        await h.req("post", "/platform/owners", pg.managerToken, {
          name: "Nope",
          email: `nope-${suffix}@example.com`,
          password: "password123",
        })
      ).status,
    ).toBe(403);
  });
});
