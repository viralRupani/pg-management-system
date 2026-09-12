import "reflect-metadata";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { inArray } from "drizzle-orm";
import type Redis from "ioredis";
import request from "supertest";
import { UserRole } from "@pg/shared";
import { AppModule } from "../app.module";
import { PLATFORM_DB, type Database } from "../db/database.module";
import { tenants } from "../db/schema";
import { REDIS } from "../redis/redis.module";

/**
 * Shared e2e harness. Boots the real AppModule in-process (Test + supertest) and
 * drives it over HTTP, exactly like a client would. This is the committed
 * regression net that replaces the throwaway `/tmp/m*-e2e.mjs` scripts. Requires
 * infra up + migrated (`pnpm infra:up && pnpm db:migrate`). Run serialized
 * (`--runInBand`) — every spec shares one Postgres + Redis.
 *
 * Tokens reuse the app's OWN `JwtService` (real ACCESS secret) and OTP is read
 * straight from the app's `REDIS` client, so the auth path under test is real.
 */

/** Load apps/api/.env into process.env (without clobbering) so loadEnv() passes. */
function loadDotEnv(): void {
  const envPath = path.resolve(__dirname, "../../.env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadDotEnv();
// Hard fallbacks so the suite runs even without a .env file present.
process.env.DATABASE_URL ??=
  "postgres://app_user:app_user_pw@localhost:5433/pg_management";
process.env.PLATFORM_DATABASE_URL ??=
  "postgres://platform_user:platform_user_pw@localhost:5433/pg_management";
process.env.JWT_ACCESS_SECRET ??= "dev-access-secret-change-me";
process.env.JWT_REFRESH_SECRET ??= "dev-refresh-secret-change-me";

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

export interface TestPg {
  id: string;
  slug: string;
  managerEmail: string;
  /** A logged-in PG_MANAGER access token for this tenant. */
  managerToken: string;
}

export interface Harness {
  app: INestApplication;
  /** Issue an HTTP call; pass a token to authenticate, a body to send. */
  req(
    method: HttpMethod,
    path: string,
    token?: string,
    body?: unknown,
  ): request.Test;
  /** Mint a PLATFORM_ADMIN token (no login endpoint exists for super-admin). */
  platformToken(): string;
  /** Onboard a PG + first manager, then log the manager in. */
  onboardPg(slugBase: string): Promise<TestPg>;
  /** Manager email+password login → access token. */
  managerLogin(email: string, password?: string): Promise<string>;
  /**
   * Manager registers a resident; returns the new resident id. Long-term
   * residents get a default email and are auto-email-verified (so the allocation
   * gate passes) unless `fields.skipEmailVerify` is set. Short-stay guests are
   * left as-is (no email, no verification). Pass an explicit `email` to override.
   */
  registerResident(
    managerToken: string,
    fields: Record<string, unknown>,
  ): Promise<string>;
  /** Read the email-verification OTP for a resident from Redis (or null). */
  getEmailOtp(tenantId: string, residentId: string): Promise<string | null>;
  /** Request + verify a resident's email (reads the OTP from Redis). */
  verifyResidentEmail(managerToken: string, residentId: string): Promise<void>;
  /**
   * Full resident email-OTP login flow (reads the dev OTP from Redis) →
   * access token. Still takes `phone`, not `email` — see the implementation.
   */
  residentLogin(slug: string, tenantId: string, phone: string): Promise<string>;
  /** Read the current login-OTP code from Redis (or null) — for testing the verify flow. */
  getOtp(tenantId: string, phone: string): Promise<string | null>;
  /** Read the current login-OTP code from Redis by the exact email used (no phone-derivation). */
  getEmailLoginOtp(tenantId: string, email: string): Promise<string | null>;
  /** Read the password-reset token for a specific email (null if none/expired). */
  getPwResetToken(email: string): Promise<string | null>;
  /** Tear down: delete created tenants (cascade) and close the app. */
  close(): Promise<void>;
}

const DEFAULT_PASSWORD = "password123";

export async function createHarness(): Promise<Harness> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  const http = app.getHttpServer();
  const jwt = app.get(JwtService);
  const redis = app.get<Redis>(REDIS);
  const platformDb = app.get<Database>(PLATFORM_DB);
  const createdTenantIds: string[] = [];
  const suffix = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

  function req(
    method: HttpMethod,
    p: string,
    token?: string,
    body?: unknown,
  ): request.Test {
    let r = request(http)[method](p);
    if (token) r = r.set("authorization", `Bearer ${token}`);
    if (body !== undefined) r = r.send(body as object);
    return r;
  }

  function platformToken(): string {
    return jwt.sign({
      sub: randomUUID(),
      tenantId: null,
      role: UserRole.PLATFORM_ADMIN,
    });
  }

  async function managerLogin(
    email: string,
    password = DEFAULT_PASSWORD,
  ): Promise<string> {
    const res = await req("post", "/auth/manager/login", undefined, {
      email,
      password,
    });
    if (!res.body?.accessToken) {
      throw new Error(`manager login failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.accessToken;
  }

  async function onboardPg(slugBase: string): Promise<TestPg> {
    const slug = `${slugBase}-${suffix}`;
    const managerEmail = `mgr-${slug}@example.com`;
    const res = await req("post", "/platform/tenants", platformToken(), {
      name: `PG ${slug}`,
      slug,
      manager: {
        name: "Manager",
        email: managerEmail,
        password: DEFAULT_PASSWORD,
        phone: "+919800000000",
      },
    });
    if (res.status !== 201 && res.status !== 200) {
      throw new Error(`onboard failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    createdTenantIds.push(res.body.id);
    const managerToken = await managerLogin(managerEmail);
    return { id: res.body.id, slug, managerEmail, managerToken };
  }

  function getEmailOtp(
    tenantId: string,
    residentId: string,
  ): Promise<string | null> {
    return redis.get(`email_otp:${tenantId}:${residentId}`);
  }

  async function verifyResidentEmail(
    managerToken: string,
    residentId: string,
  ): Promise<void> {
    const tenantId = (jwt.decode(managerToken) as { tenantId: string })
      .tenantId;
    const reqRes = await req(
      "post",
      `/residents/${residentId}/email/verify/request`,
      managerToken,
    );
    if (reqRes.status !== 201 && reqRes.status !== 200) {
      throw new Error(
        `email OTP request failed: ${reqRes.status} ${JSON.stringify(reqRes.body)}`,
      );
    }
    const code = await getEmailOtp(tenantId, residentId);
    if (!code) throw new Error(`no email OTP in Redis for ${residentId}`);
    const verifyRes = await req(
      "post",
      `/residents/${residentId}/email/verify`,
      managerToken,
      { code },
    );
    if (verifyRes.status !== 201 && verifyRes.status !== 200) {
      throw new Error(
        `email verify failed: ${verifyRes.status} ${JSON.stringify(verifyRes.body)}`,
      );
    }
  }

  async function registerResident(
    managerToken: string,
    fields: Record<string, unknown>,
  ): Promise<string> {
    // `skipEmailVerify` is a harness-only flag (not a DTO field) — strip it.
    const { skipEmailVerify, ...body } = fields as {
      skipEmailVerify?: boolean;
      [k: string]: unknown;
    };
    const isShortStay = body.isShortStay === true;
    // age is mandatory for long-term residents; email is too (it's now also
    // the login key — see residentLogin). Default both so specs that don't
    // care can omit them; the default email is DERIVED from phone (like
    // scripts/add-residents.mjs's seed pattern) so residentLogin can compute
    // the same email from just the phone it's already called with — no
    // per-spec plumbing needed.
    const res = await req("post", "/residents", managerToken, {
      ...(isShortStay
        ? {}
        : { age: 25, email: defaultResidentEmail(body.phone as string) }),
      ...body,
    });
    if (res.status !== 201 && res.status !== 200) {
      throw new Error(`register resident failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    const residentId = res.body.id as string;
    // Auto-verify long-term residents so the downstream allocation/booking gate
    // passes. Specs that exercise the gate itself pass skipEmailVerify.
    if (!isShortStay && !skipEmailVerify) {
      await verifyResidentEmail(managerToken, residentId);
    }
    return residentId;
  }

  /**
   * Full resident login flow — email OTP. Still takes `phone` (not `email`)
   * so every existing call site keeps working unchanged: the email used is
   * DERIVED from phone via `defaultResidentEmail`, the same formula
   * `registerResident` used to default the resident's email. A spec that
   * registered a resident with an explicit custom `email` must not call this
   * — none currently do (grep `residentLogin` call sites before adding one).
   */
  async function residentLogin(
    slug: string,
    tenantId: string,
    phone: string,
  ): Promise<string> {
    const email = defaultResidentEmail(phone);
    await req("post", "/auth/resident/otp/request", undefined, {
      pgCode: slug,
      email,
    });
    const code = await redis.get(
      `email_login_otp:${tenantId}:${normalizeEmail(email)}`,
    );
    if (!code) throw new Error(`no login OTP in Redis for ${email}`);
    const res = await req("post", "/auth/resident/otp/verify", undefined, {
      pgCode: slug,
      email,
      code,
    });
    if (!res.body?.accessToken) {
      throw new Error(`otp verify failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.accessToken;
  }

  /** Read the current login-OTP code from Redis (or null) — keyed by the
   *  email `defaultResidentEmail(phone)` derives, mirroring residentLogin. */
  function getOtp(tenantId: string, phone: string): Promise<string | null> {
    const email = defaultResidentEmail(phone);
    return redis.get(`email_login_otp:${tenantId}:${normalizeEmail(email)}`);
  }

  function getEmailLoginOtp(
    tenantId: string,
    email: string,
  ): Promise<string | null> {
    return redis.get(`email_login_otp:${tenantId}:${normalizeEmail(email)}`);
  }

  function getPwResetToken(email: string): Promise<string | null> {
    return redis.get(`pwreset:email:${email.toLowerCase()}`);
  }

  async function close(): Promise<void> {
    if (createdTenantIds.length) {
      await platformDb
        .delete(tenants)
        .where(inArray(tenants.id, createdTenantIds));
    }
    await app.close();
  }

  return {
    app,
    req,
    platformToken,
    onboardPg,
    managerLogin,
    registerResident,
    getEmailOtp,
    verifyResidentEmail,
    residentLogin,
    getOtp,
    getEmailLoginOtp,
    getPwResetToken,
    close,
  };
}

/**
 * Default email for auto-registered long-term residents — DERIVED from
 * phone (mirrors `scripts/add-residents.mjs`'s seed pattern) so
 * `residentLogin`/`getOtp` (which only receive `phone`) can compute the same
 * email a spec's `registerResident` call defaulted, with zero extra state.
 * Phone is already unique per spec/tenant, so this is unique too.
 */
function defaultResidentEmail(phone: string): string {
  return `resident-${phone}@example.com`;
}

/** Must match `EmailLoginOtpService.normalize` / `auth.service.ts`'s
 *  `normalizeEmail` — the Redis key and DB lookup are both case-normalized. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Unique-ish phone generator for resident seeding (bare 10 digits). */
export function randomPhone(): string {
  return "98" + String(Math.floor(10000000 + Math.random() * 80000000));
}
