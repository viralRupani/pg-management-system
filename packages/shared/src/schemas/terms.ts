import { z } from "zod";

/**
 * Terms & Conditions acceptance — the legally protective gate every PG owner and
 * manager must pass before using the admin app. Content is DB-editable markdown
 * authored by the platform super-admin; publishing a new (higher) version
 * supersedes everyone's prior acceptance, so they are re-prompted.
 */

/** A published T&C document (as returned to the platform-admin management UI). */
export const tcVersionSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  body: z.string(),
  publishedByEmail: z.string().nullable(),
  publishedAt: z.string(),
});
export type TcVersion = z.infer<typeof tcVersionSchema>;

/**
 * The caller's acceptance status for the latest version. Fails OPEN: when no
 * version is published or the caller's credential can't be resolved (e.g. an
 * owner on a PG-scoped token), `accepted` is true and `latestVersion` is null,
 * so the gate never traps a legitimate session. `body`/`publishedAt` are
 * included so the /terms page renders from a single call.
 */
export const tcStatusSchema = z.object({
  latestVersion: z.number().int().positive().nullable(),
  accepted: z.boolean(),
  body: z.string().nullable(),
  publishedAt: z.string().nullable(),
});
export type TcStatus = z.infer<typeof tcStatusSchema>;

/** Owner/manager accepts a specific version (must equal the current latest). */
export const tcAcceptInputSchema = z.object({
  version: z.number().int().positive(),
});
export type TcAcceptInput = z.infer<typeof tcAcceptInputSchema>;

/** Platform admin publishes a new T&C version (body is required markdown text). */
export const publishTcInputSchema = z.object({
  body: z.string().trim().min(20).max(50_000),
});
export type PublishTcInput = z.infer<typeof publishTcInputSchema>;
