import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import type { JwtPayload, TcStatus, TcVersion } from "@pg/shared";
import { APP_DB, type Database } from "../db/database.module";
import { tcAcceptances, tcVersions } from "../db/schema";
import { AuthRepository } from "../auth/auth.repository";

/**
 * Terms & Conditions acceptance + publishing.
 *
 * Injects `APP_DB` DIRECTLY (like AuthRepository), NOT `ctx.db()` / `PLATFORM_DB`:
 * the tc_* tables are GLOBAL (no RLS), and the accept/status calls must work both
 * inside a tenant context (a manager on a PG-scoped token) AND without one (an
 * owner on their global token, tenantId null). A tenant txn is neither required
 * nor available in the owner-global case.
 *
 * Acceptance is keyed by `auth_identities.id` — the single stable per-human
 * credential — resolved from the JWT via `AuthRepository.findIdentityForPrincipal`.
 */
@Injectable()
export class TermsService {
  constructor(
    @Inject(APP_DB) private readonly db: Database,
    private readonly auth: AuthRepository,
  ) {}

  /** The current (highest-version) published T&C, or null when none exists. */
  private async latest() {
    const [row] = await this.db
      .select()
      .from(tcVersions)
      .orderBy(desc(tcVersions.version))
      .limit(1);
    return row ?? null;
  }

  /**
   * The caller's acceptance status for the latest version. FAILS OPEN (never
   * 401): if nothing is published, or the credential can't be resolved (an owner
   * on a PG-scoped token — the in-PG PG_OWNER `users` row has no auth_identities
   * row), report `accepted:true, latestVersion:null` so the gate can't trap a
   * legitimate session or trip the api-client 401 → /login redirect loop.
   */
  async getStatus(principal: JwtPayload): Promise<TcStatus> {
    const latest = await this.latest();
    if (!latest) {
      return { latestVersion: null, accepted: true, body: null, publishedAt: null };
    }
    const identity = await this.auth.findIdentityForPrincipal(
      principal.sub,
      principal.tenantId,
      principal.role,
    );
    if (!identity) {
      return { latestVersion: null, accepted: true, body: null, publishedAt: null };
    }
    const [accepted] = await this.db
      .select({ id: tcAcceptances.id })
      .from(tcAcceptances)
      .where(
        and(
          eq(tcAcceptances.authIdentityId, identity.id),
          eq(tcAcceptances.version, latest.version),
        ),
      )
      .limit(1);
    return {
      latestVersion: latest.version,
      accepted: Boolean(accepted),
      body: latest.body,
      publishedAt: latest.publishedAt.toISOString(),
    };
  }

  /**
   * Record the caller's acceptance of `version` (idempotent). Rejects a version
   * that isn't the current latest (409) so a stale client can't accept a
   * superseded document. The unique(authIdentityId, version) index + conflict
   * do-nothing makes a repeat accept a no-op.
   */
  async accept(principal: JwtPayload, version: number): Promise<{ accepted: true }> {
    const latest = await this.latest();
    if (!latest || version !== latest.version) {
      throw new ConflictException(
        "The terms have changed. Please reload and accept the latest version.",
      );
    }
    const identity = await this.auth.findIdentityForPrincipal(
      principal.sub,
      principal.tenantId,
      principal.role,
    );
    if (!identity) {
      // Guard the notNull FK: an unresolvable credential (owner on a PG-scoped
      // token) must never attempt an insert with a null authIdentityId.
      throw new BadRequestException("Cannot resolve your account credential.");
    }
    await this.db
      .insert(tcAcceptances)
      .values({ authIdentityId: identity.id, version })
      .onConflictDoNothing({
        target: [tcAcceptances.authIdentityId, tcAcceptances.version],
      });
    return { accepted: true };
  }

  /** All published versions, newest first (platform-admin management view). */
  async listVersions(): Promise<TcVersion[]> {
    const rows = await this.db
      .select()
      .from(tcVersions)
      .orderBy(desc(tcVersions.version));
    return rows.map((r) => ({
      id: r.id,
      version: r.version,
      body: r.body,
      publishedByEmail: r.publishedByEmail,
      publishedAt: r.publishedAt.toISOString(),
    }));
  }

  /**
   * Publish a new version (= max(version)+1). Supersedes everyone's prior
   * acceptance → all owners/managers are re-prompted. The audit label is the
   * platform admin's email, resolved from their credential (`sub` = the
   * auth_identities id — a platform admin has no `users` row).
   */
  async publish(principal: JwtPayload, body: string): Promise<TcVersion> {
    const publisher = await this.auth.findIdentityById(principal.sub);
    const latest = await this.latest();
    const nextVersion = (latest?.version ?? 0) + 1;
    const [row] = await this.db
      .insert(tcVersions)
      .values({
        version: nextVersion,
        body,
        publishedByEmail: publisher?.email ?? null,
      })
      .returning();
    return {
      id: row.id,
      version: row.version,
      body: row.body,
      publishedByEmail: row.publishedByEmail,
      publishedAt: row.publishedAt.toISOString(),
    };
  }
}
