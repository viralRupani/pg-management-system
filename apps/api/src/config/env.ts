import { z } from "zod";
import { MAX_UPLOAD_BYTES } from "@pg/shared";

/**
 * Validated environment. Fails fast at boot if anything required is missing.
 * Three distinct DB URLs encode the RLS role separation:
 *   - DATABASE_URL           app_user      (NOBYPASSRLS) — tenant requests
 *   - PLATFORM_DATABASE_URL  platform_user (BYPASSRLS)   — platform module only
 *   - MIGRATION_DATABASE_URL postgres    (owner)       — migrations only
 */
const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  // 3000 = admin web, 3001 = resident web, 8081 = Expo dev. The browser enforces
  // CORS (the native app doesn't), so the resident web origin must be allowed.
  // Override in prod with the deployed admin + resident web origins.
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://localhost:3001,http://localhost:8081"),

  DATABASE_URL: z.string().url(),
  PLATFORM_DATABASE_URL: z.string().url(),
  MIGRATION_DATABASE_URL: z.string().url().optional(),
  // Max connections in the app pool. The isolation test sets this to 1 to force
  // connection reuse and expose any session-scoped tenant-context leak.
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),

  REDIS_URL: z.string().url().default("redis://localhost:6379"),

  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  JWT_ACCESS_TTL: z.string().default("900s"),
  JWT_REFRESH_TTL: z.string().default("30d"),

  OTP_TTL_SECONDS: z.coerce.number().default(300),
  // Single-use password-reset token lifetime, in seconds (default 15 min).
  PWRESET_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  // Base URL of the admin web app — used to build password-reset links emailed
  // to managers/owners. Defaults to the local admin dev server.
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  // Logs OTP codes to stdout for local dev. Defaults OFF (safe by default) and is
  // force-disabled in production regardless of the env value (see loadEnv) so a
  // misconfigured prod box can never leak codes to logs.
  OTP_DEV_LOG: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  // Dev convenience: force every issued OTP to this fixed 6-digit code so the
  // mobile app can be exercised without reading Redis/logs. Kept a STRING (never
  // coerced — leading zeros are significant). Force-cleared in production below
  // so a fixed code can never weaken a real deployment.
  OTP_DEV_FIXED_CODE: z
    .string()
    .regex(/^\d{6}$/, "Must be exactly 6 digits")
    .optional(),

  // File storage (S3 presigned POST). `local` uses the in-process stub (dev/CI,
  // no creds needed); `s3` requires the four S3_* creds below (enforced in the
  // superRefine). Uploads round-trip directly between client and S3 — the API
  // only ever mints presigned URLs and persists keys.
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  ACCESS_KEY_ID: z.string().optional(),
  SECRET_ACCESS_KEY: z.string().optional(),
  // Presigned URL lifetime, in seconds — the default for uploads AND non-KYC
  // downloads (logos, UPI QR, payment proofs, complaint photos).
  S3_PRESIGN_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  // KYC document READ link lifetime, in seconds. Deliberately short: a KYC view
  // link should live only long enough to render, not be shared or bookmarked.
  // Scoped to KYC downloads only (DocumentsService.getDownloadUrl).
  S3_KYC_DOWNLOAD_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(120),
  // Max upload size in bytes; the presigned-POST policy edge-rejects anything
  // larger. Defaults to the shared MAX_UPLOAD_BYTES (5 MB).
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(MAX_UPLOAD_BYTES),
  // S3-compatible/MinIO only — leave unset for AWS.
  S3_ENDPOINT: z.string().url().optional(),
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  // Outbound email (AWS SES). Setting SES_FROM_EMAIL switches the EmailProvider
  // from the console stub to real SES sends (password-reset links); leave it
  // unset for dev/CI. SES reuses the S3_* credentials (the same IAM principal is
  // granted ses:SendEmail) — so STORAGE_DRIVER=s3 is NOT required, but the creds
  // must be present (enforced in the superRefine). SES is regional: SES_REGION
  // overrides, else S3_REGION is used. The From address must be a verified SES
  // identity in that region, and in a sandbox account every recipient must be
  // verified too.
  SES_FROM_EMAIL: z.string().email().optional(),
  SES_REGION: z.string().optional(),
  // Display name on the From header ("PG Manager" <no-reply@…>) and the brand
  // name shown inside the email templates. A named sender reads as professional
  // and helps deliverability.
  MAIL_FROM_NAME: z.string().default("PG Manager"),
  // Optional Reply-To. Set to a monitored inbox if you want replies to reach a
  // human; otherwise the templates already say "do not reply".
  MAIL_REPLY_TO: z.string().email().optional(),
});

const envSchemaChecked = envSchema.superRefine((env, ctx) => {
  if (env.STORAGE_DRIVER === "s3") {
    for (const key of [
      "S3_REGION",
      "S3_BUCKET",
      "ACCESS_KEY_ID",
      "SECRET_ACCESS_KEY",
    ] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when STORAGE_DRIVER=s3`,
        });
      }
    }
  }

  // SES is opt-in via SES_FROM_EMAIL; when enabled it needs the (reused) S3
  // credentials and a region, so a half-configured deploy fails fast at boot
  // rather than silently throwing on the first send.
  if (env.SES_FROM_EMAIL) {
    for (const key of ["ACCESS_KEY_ID", "SECRET_ACCESS_KEY"] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when SES_FROM_EMAIL is set (SES reuses the S3 credentials)`,
        });
      }
    }
    if (!env.SES_REGION && !env.S3_REGION) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SES_REGION"],
        message: "SES_REGION (or S3_REGION) is required when SES_FROM_EMAIL is set",
      });
    }
  }
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = envSchemaChecked.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  // Defense in depth: never log OTP codes in production, whatever the env says.
  if (parsed.data.NODE_ENV === "production") parsed.data.OTP_DEV_LOG = false;
  // ...and never honour a fixed dev OTP in production, whatever the env says.
  if (parsed.data.NODE_ENV === "production")
    parsed.data.OTP_DEV_FIXED_CODE = undefined;
  return parsed.data;
}

export const ENV = Symbol("ENV");

export function corsOrigins(env: AppEnv): string[] {
  return env.CORS_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}
