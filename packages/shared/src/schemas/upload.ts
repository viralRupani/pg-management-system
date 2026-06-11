import { z } from "zod";

/**
 * Upload constraints — the single source of truth shared by the API (presign +
 * server-side allowlist), the admin web app, and the resident mobile app (UI
 * labels + client-side size guard). Uploads use S3 presigned POST: the API mints
 * a policy that pins the content-type and a content-length-range, so S3 itself
 * edge-rejects an oversize or wrong-type file. The constants here keep the
 * client checks and the server policy in lockstep.
 */

/** Max upload size in bytes (5 MB). Mirrored by UPLOAD_MAX_BYTES env default. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Human label for UI ("Max file size: 5 MB"). */
export const MAX_UPLOAD_LABEL = "5 MB";

/** The storage "kind" (also the S3 key prefix: `{tenantId}/{kind}/{uuid}`). */
export const UPLOAD_KINDS = ["kyc", "payments", "complaints", "logos"] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Allowed content-types per workflow. KYC also accepts PDFs (Aadhaar, agreements). */
export const UPLOAD_ALLOWED_TYPES: Record<UploadKind, readonly string[]> = {
  payments: IMAGE_TYPES,
  complaints: IMAGE_TYPES,
  logos: IMAGE_TYPES,
  kyc: [...IMAGE_TYPES, "application/pdf"],
};

/** True if `contentType` is permitted for the given upload kind. */
export function isAllowedType(kind: UploadKind, contentType: string): boolean {
  return UPLOAD_ALLOWED_TYPES[kind].includes(contentType);
}

/**
 * A declared upload content-type. Validated loosely here (non-empty MIME-ish
 * string); the per-kind allowlist (isAllowedType) is enforced server-side where
 * the kind is known, and S3's POST policy is the backstop.
 */
export const contentTypeField = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[\w.+-]+\/[\w.+-]+$/, "Must be a MIME type");

/**
 * What the API returns from every `*-url` endpoint: an S3 presigned POST. The
 * client builds a multipart form with `fields` (in order), appends the binary
 * `file` LAST, and POSTs to `url`. `key` is persisted on the row by the confirm
 * step (never a URL).
 */
export const presignedUploadSchema = z.object({
  url: z.string(),
  fields: z.record(z.string()),
  key: z.string(),
});
export type PresignedUploadResult = z.infer<typeof presignedUploadSchema>;
