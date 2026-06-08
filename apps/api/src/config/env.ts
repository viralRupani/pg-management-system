import { z } from "zod";

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
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://localhost:8081"),

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
  // Logs OTP codes to stdout for local dev. Defaults OFF (safe by default) and is
  // force-disabled in production regardless of the env value (see loadEnv) so a
  // misconfigured prod box can never leak codes to logs.
  OTP_DEV_LOG: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  // Defense in depth: never log OTP codes in production, whatever the env says.
  if (parsed.data.NODE_ENV === "production") parsed.data.OTP_DEV_LOG = false;
  return parsed.data;
}

export const ENV = Symbol("ENV");

export function corsOrigins(env: AppEnv): string[] {
  return env.CORS_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}
