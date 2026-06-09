import "reflect-metadata";
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, inArray } from "drizzle-orm";
import { UserRole } from "@pg/shared";
import {
  allocations,
  announcementRecipients,
  announcements,
  beds,
  billingSnapshots,
  budgets,
  buildings,
  complaintUpdates,
  complaints,
  deposits,
  documents,
  expenses,
  floors,
  invoices,
  menuConfig,
  menuSlots,
  rooms,
  schema,
  tenants,
  users,
} from "../db/schema";
import { TenantContextService } from "../db/tenant-context";

/**
 * THE gate test for Milestone 1: proves PG A can never read or write PG B's
 * rows. It deliberately forces the failure mode that a naive session-scoped SET
 * would exhibit:
 *   - app pool max = 1, so consecutive requests REUSE the same connection;
 *   - runs as app_user (NOBYPASSRLS) — asserted, so RLS actually applies;
 *   - covers USING (reads), fail-closed default-deny, and WITH CHECK (forged
 *     tenant_id on INSERT); plus proves the platform BYPASSRLS role can read
 *     across tenants.
 *
 * Requires: `pnpm infra:up && pnpm db:migrate` first.
 */
const APP_URL =
  process.env.DATABASE_URL ??
  "postgres://app_user:app_user_pw@localhost:5433/pg_management";
const PLATFORM_URL =
  process.env.PLATFORM_DATABASE_URL ??
  "postgres://platform_user:platform_user_pw@localhost:5433/pg_management";

describe("cross-tenant isolation (RLS gate)", () => {
  let appPool: Pool;
  let platformPool: Pool;
  let appDb: NodePgDatabase<typeof schema>;
  let platformDb: NodePgDatabase<typeof schema>;
  let tcs: TenantContextService;

  let tenantA: string;
  let tenantB: string;
  let residentA: string;
  let residentA2: string; // second resident in tenant A (intra-tenant case)
  let bedA: string;
  let buildingA: string;
  let buildingB: string;
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    appPool = new Pool({ connectionString: APP_URL, max: 1 }); // force reuse
    platformPool = new Pool({ connectionString: PLATFORM_URL, max: 2 });
    appDb = drizzle(appPool, { schema });
    platformDb = drizzle(platformPool, { schema });
    tcs = new TenantContextService(appDb as never);

    // Seed two tenants + one resident each via the BYPASSRLS platform pool.
    const [a] = await platformDb
      .insert(tenants)
      .values({ name: "PG A", slug: `pg-a-${suffix}` })
      .returning();
    const [b] = await platformDb
      .insert(tenants)
      .values({ name: "PG B", slug: `pg-b-${suffix}` })
      .returning();
    tenantA = a.id;
    tenantB = b.id;

    const seededUsers = await platformDb
      .insert(users)
      .values([
        {
          tenantId: tenantA,
          role: UserRole.RESIDENT,
          name: "Alice A",
          phone: "+910000000001",
        },
        {
          tenantId: tenantA,
          role: UserRole.RESIDENT,
          name: "Anita A",
          phone: "+910000000003",
        },
        {
          tenantId: tenantB,
          role: UserRole.RESIDENT,
          name: "Bob B",
          phone: "+910000000002",
        },
      ])
      .returning();
    const aResidents = seededUsers.filter((u) => u.tenantId === tenantA);
    residentA = aResidents[0].id;
    residentA2 = aResidents[1].id;

    // Seed a property chain for A (building->floor->room->bed) and a lone
    // building for B (target of the cross-tenant FK probe), via BYPASSRLS.
    const [bA] = await platformDb
      .insert(buildings)
      .values({ tenantId: tenantA, name: "Block A" })
      .returning();
    const [bB] = await platformDb
      .insert(buildings)
      .values({ tenantId: tenantB, name: "Block B" })
      .returning();
    buildingA = bA.id;
    buildingB = bB.id;

    const [flA] = await platformDb
      .insert(floors)
      .values({ tenantId: tenantA, buildingId: buildingA, label: "G" })
      .returning();
    const [rmA] = await platformDb
      .insert(rooms)
      .values({ tenantId: tenantA, floorId: flA.id, label: "101" })
      .returning();
    const [bdA] = await platformDb
      .insert(beds)
      .values({ tenantId: tenantA, roomId: rmA.id, label: "A" })
      .returning();
    bedA = bdA.id;
  });

  afterAll(async () => {
    if (platformDb) {
      await platformDb
        .delete(tenants)
        .where(inArray(tenants.id, [tenantA, tenantB].filter(Boolean)));
    }
    await appPool?.end();
    await platformPool?.end();
  });

  it("runs as a NOBYPASSRLS role (otherwise the whole test is a false green)", async () => {
    const res = await appPool.query(
      "select current_user as usr, rolbypassrls from pg_roles where rolname = current_user",
    );
    expect(res.rows[0].usr).toBe("app_user");
    expect(res.rows[0].rolbypassrls).toBe(false);
  });

  it("scopes reads to the current tenant, even on a REUSED connection", async () => {
    const aRows = await tcs.run(tenantA, async () =>
      tcs.db().select().from(users),
    );
    expect(aRows.map((r) => r.name).sort()).toEqual(["Alice A", "Anita A"]);

    // Same single connection is reused here — a session-scoped SET would leak.
    const bRows = await tcs.run(tenantB, async () =>
      tcs.db().select().from(users),
    );
    expect(bRows.map((r) => r.name)).toEqual(["Bob B"]);

    // A explicitly probing for B's tenant_id sees nothing.
    const leaked = await tcs.run(tenantA, async () =>
      tcs.db().select().from(users).where(eq(users.tenantId, tenantB)),
    );
    expect(leaked).toHaveLength(0);
  });

  it("fails closed: no tenant context => zero rows visible", async () => {
    const rows = await appDb.select().from(users);
    expect(rows).toHaveLength(0);
  });

  it("rejects INSERT with a forged tenant_id (WITH CHECK)", async () => {
    await expect(
      tcs.run(tenantA, async () =>
        tcs
          .db()
          .insert(users)
          .values({
            tenantId: tenantB, // forged: not the context tenant
            role: UserRole.RESIDENT,
            name: "Forged",
          }),
      ),
    ).rejects.toThrow();
  });

  it("scopes allocations to the current tenant", async () => {
    // A allocates its own resident to its own bed.
    await tcs.run(tenantA, async () =>
      tcs
        .db()
        .insert(allocations)
        .values({ tenantId: tenantA, bedId: bedA, residentId: residentA }),
    );

    const aRows = await tcs.run(tenantA, async () =>
      tcs.db().select().from(allocations),
    );
    expect(aRows).toHaveLength(1);

    const bRows = await tcs.run(tenantB, async () =>
      tcs.db().select().from(allocations),
    );
    expect(bRows).toHaveLength(0);
  });

  it("rejects a child referencing another tenant's parent (composite FK)", async () => {
    // As tenant A, try to attach a floor to tenant B's building. tenant_id=A
    // passes WITH CHECK, but the (building_id, tenant_id) composite FK has no
    // matching (B-building, A) row -> rejected. This is the schema-level proof
    // that cross-tenant references are unrepresentable (FK checks bypass RLS).
    await expect(
      tcs.run(tenantA, async () =>
        tcs.db().insert(floors).values({
          tenantId: tenantA,
          buildingId: buildingB, // another tenant's building
          label: "X",
        }),
      ),
    ).rejects.toThrow();
  });

  it("enforces one active allocation per bed (no double-booking)", async () => {
    // A's bed already has an active allocation (from the earlier test). A second
    // active allocation on the same bed must violate the partial-unique index.
    await expect(
      tcs.run(tenantA, async () =>
        tcs
          .db()
          .insert(allocations)
          .values({ tenantId: tenantA, bedId: bedA, residentId: residentA }),
      ),
    ).rejects.toThrow();
  });

  it("scopes invoices across tenants, but NOT between residents of one tenant", async () => {
    // Seed an invoice for each of tenant A's two residents.
    await tcs.run(tenantA, async () =>
      tcs.db().insert(invoices).values([
        {
          tenantId: tenantA,
          residentId: residentA,
          period: "2026-06",
          amountPaise: 800000,
          dueDate: new Date("2026-06-10T00:00:00Z"),
        },
        {
          tenantId: tenantA,
          residentId: residentA2,
          period: "2026-06",
          amountPaise: 900000,
          dueDate: new Date("2026-06-10T00:00:00Z"),
        },
      ]),
    );

    // Cross-tenant: tenant B sees none of A's invoices (RLS does its job).
    const bSees = await tcs.run(tenantB, async () =>
      tcs.db().select().from(invoices),
    );
    expect(bSees).toHaveLength(0);

    // Intra-tenant: under A's context RLS returns BOTH residents' invoices —
    // RLS keys on tenant_id, so it does NOT isolate residents from each other.
    // This is exactly why every resident endpoint must filter by
    // resident_id = the caller's JWT sub (enforced in RentService, covered by
    // the HTTP e2e). This assertion pins that boundary so the gap can't ship
    // silently.
    const aSeesAll = await tcs.run(tenantA, async () =>
      tcs.db().select().from(invoices),
    );
    expect(aSeesAll).toHaveLength(2);
  });

  it("scopes documents and deposits across tenants", async () => {
    // Seed a KYC doc and a deposit for tenant A's resident.
    await tcs.run(tenantA, async () => {
      await tcs
        .db()
        .insert(documents)
        .values({
          tenantId: tenantA,
          residentId: residentA,
          type: "AADHAAR",
          s3Key: `${tenantA}/kyc/x`,
        });
      await tcs
        .db()
        .insert(deposits)
        .values({
          tenantId: tenantA,
          residentId: residentA,
          amountPaise: 1000000,
        });
    });

    // Tenant B sees neither (RLS isolates tenants).
    const bDocs = await tcs.run(tenantB, async () =>
      tcs.db().select().from(documents),
    );
    const bDeposits = await tcs.run(tenantB, async () =>
      tcs.db().select().from(deposits),
    );
    expect(bDocs).toHaveLength(0);
    expect(bDeposits).toHaveLength(0);
  });

  it("scopes the M5 operations tables across tenants", async () => {
    // Seed one row in each M5 operations table for tenant A.
    await tcs.run(tenantA, async () => {
      const [c] = await tcs
        .db()
        .insert(complaints)
        .values({
          tenantId: tenantA,
          residentId: residentA,
          category: "MAINTENANCE",
          description: "Leaky tap in 101",
          status: "OPEN",
        })
        .returning();
      await tcs.db().insert(complaintUpdates).values({
        tenantId: tenantA,
        complaintId: c.id,
        authorUserId: residentA,
        note: "Please send a plumber.",
      });
      await tcs.db().insert(menuConfig).values({
        tenantId: tenantA,
        cycleLengthWeeks: 1,
        cycleStartDate: "2026-06-02",
      });
      await tcs.db().insert(menuSlots).values({
        tenantId: tenantA,
        weekNumber: 1,
        dayOfWeek: 1,
        mealType: "LUNCH",
        items: "Dal, Rice, Sabzi",
      });
      const [ann] = await tcs
        .db()
        .insert(announcements)
        .values({
          tenantId: tenantA,
          title: "Water cut",
          body: "No water 2-4pm today.",
          audienceType: "SPECIFIC",
          createdByUserId: residentA, // any in-tenant user (composite FK)
        })
        .returning({ id: announcements.id });
      await tcs.db().insert(announcementRecipients).values({
        tenantId: tenantA,
        announcementId: ann.id,
        recipientUserId: residentA,
      });
      await tcs.db().insert(budgets).values({
        tenantId: tenantA,
        category: "GROCERIES",
        period: "2026-06",
        limitPaise: 5000000,
      });
      await tcs.db().insert(expenses).values({
        tenantId: tenantA,
        category: "GROCERIES",
        amountPaise: 120000,
        spentOn: "2026-06-05",
        recordedByUserId: residentA,
      });
    });

    // Tenant B sees none of them — RLS isolates every M5 table.
    const bSees = await tcs.run(tenantB, async () => ({
      complaints: await tcs.db().select().from(complaints),
      complaintUpdates: await tcs.db().select().from(complaintUpdates),
      menuConfig: await tcs.db().select().from(menuConfig),
      menuSlots: await tcs.db().select().from(menuSlots),
      announcements: await tcs.db().select().from(announcements),
      announcementRecipients: await tcs
        .db()
        .select()
        .from(announcementRecipients),
      budgets: await tcs.db().select().from(budgets),
      expenses: await tcs.db().select().from(expenses),
    }));
    expect(bSees.complaints).toHaveLength(0);
    expect(bSees.complaintUpdates).toHaveLength(0);
    expect(bSees.menuConfig).toHaveLength(0);
    expect(bSees.menuSlots).toHaveLength(0);
    expect(bSees.announcements).toHaveLength(0);
    expect(bSees.announcementRecipients).toHaveLength(0);
    expect(bSees.budgets).toHaveLength(0);
    expect(bSees.expenses).toHaveLength(0);
  });

  it("scopes billing_snapshots (defense-in-depth on the platform metering table)", async () => {
    // Snapshots are written by the platform (BYPASSRLS) pool. They still carry
    // RLS, so on the app_user (tenant) path they fail closed and never cross
    // tenants. Seed a snapshot for A via the platform pool, then probe as app_user.
    await platformDb.insert(billingSnapshots).values({
      tenantId: tenantA,
      period: "2026-06",
      activeResidents: 3,
      ratePaise: 1000,
      amountDuePaise: 3000,
    });

    // Tenant B's context sees none of A's snapshots.
    const bSees = await tcs.run(tenantB, async () =>
      tcs.db().select().from(billingSnapshots),
    );
    expect(bSees).toHaveLength(0);

    // No context at all => fail closed (zero rows) even for A's own snapshot.
    const noCtx = await appDb.select().from(billingSnapshots);
    expect(noCtx).toHaveLength(0);
  });

  it("lets the platform (BYPASSRLS) role read across tenants", async () => {
    const rows = await platformDb
      .select()
      .from(users)
      .where(inArray(users.tenantId, [tenantA, tenantB]));
    const names = rows.map((r) => r.name).sort();
    expect(names).toEqual(["Alice A", "Anita A", "Bob B"]);
  });

  it("scopes a PG_OWNER's per-tenant user row like any other user (role doesn't bypass RLS)", async () => {
    // An owner gets a per-tenant PG_OWNER `users` row in each PG they own (their
    // in-PG actor). It's a normal RLS row — the cross-tenant owner identity lives
    // in the no-RLS `owners`/`owner_tenants` tables, NOT here. Seed one in A via
    // the platform pool, then prove tenant B can't see it and no-context fails
    // closed. (Added last so it doesn't perturb the exact-count assertions above.)
    await platformDb
      .insert(users)
      .values({ tenantId: tenantA, role: UserRole.PG_OWNER, name: "Owner A" });

    const aSees = await tcs.run(tenantA, async () =>
      tcs.db().select().from(users).where(eq(users.role, UserRole.PG_OWNER)),
    );
    expect(aSees.map((r) => r.name)).toEqual(["Owner A"]);

    const bSees = await tcs.run(tenantB, async () =>
      tcs.db().select().from(users).where(eq(users.role, UserRole.PG_OWNER)),
    );
    expect(bSees).toHaveLength(0);

    const noCtx = await appDb
      .select()
      .from(users)
      .where(eq(users.role, UserRole.PG_OWNER));
    expect(noCtx).toHaveLength(0);
  });
});
