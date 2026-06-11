import { BadRequestException, Global, Module } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { type UploadKind, isAllowedType } from "@pg/shared";
import {
  GetObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV, type AppEnv } from "../config/env";

export const STORAGE_PROVIDER = Symbol("STORAGE_PROVIDER");

export interface PresignedUpload {
  /** S3 endpoint the client POSTs the multipart form to (never proxied via API). */
  url: string;
  /**
   * Form fields the client must include (policy, signature, key, Content-Type, …).
   * The client appends these IN ORDER, then the binary `file` field LAST.
   */
  fields: Record<string, string>;
  /** The opaque object key persisted on the row (payments.screenshot_key, etc.). */
  key: string;
}

/**
 * File storage seam. Production = AWS S3 presigned POST (client uploads direct;
 * the API only ever handles keys). The POST policy pins the content-type and a
 * content-length-range, so S3 itself edge-rejects an oversize or wrong-type
 * upload. For local dev / CI we use a stub that returns the same key shape, so
 * swapping drivers touches nothing else. Mirrors the SmsProvider stub pattern.
 */
export interface StorageProvider {
  presignUpload(params: {
    tenantId: string;
    kind: string; // e.g. "payments", "kyc" — also the S3 key prefix
    contentType: string;
  }): Promise<PresignedUpload>;
  presignDownload(key: string): Promise<{ downloadUrl: string }>;
}

/** Tenant-namespaced key so the real S3 layout is correct from day one. */
function buildKey(tenantId: string, kind: string): string {
  return `${tenantId}/${kind}/${randomUUID()}`;
}

/**
 * The server-side content-type gate, shared by every upload-url endpoint. The S3
 * POST policy is the backstop, but this rejects a disallowed MIME with a 400
 * before any presign (and keeps the `local` stub honest too).
 */
export function assertAllowedType(kind: UploadKind, contentType: string): void {
  if (!isAllowedType(kind, contentType)) {
    throw new BadRequestException(
      `Content type ${contentType} is not allowed for ${kind} uploads`,
    );
  }
}

class LocalStorageProvider implements StorageProvider {
  private readonly base = "https://stub-storage.local";

  async presignUpload(params: {
    tenantId: string;
    kind: string;
    contentType: string;
  }): Promise<PresignedUpload> {
    const key = buildKey(params.tenantId, params.kind);
    // Same shape as the S3 driver so clients/tests are driver-agnostic. The
    // stub URL does not accept the POST — uploads don't round-trip under `local`.
    return {
      url: `${this.base}/upload`,
      fields: { key, "Content-Type": params.contentType },
      key,
    };
  }

  async presignDownload(key: string): Promise<{ downloadUrl: string }> {
    return { downloadUrl: `${this.base}/download/${key}` };
  }
}

class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly ttl: number;
  private readonly maxBytes: number;

  constructor(env: AppEnv) {
    const config: S3ClientConfig = {
      region: env.S3_REGION!,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      },
    };
    if (env.S3_ENDPOINT) {
      config.endpoint = env.S3_ENDPOINT;
      config.forcePathStyle = env.S3_FORCE_PATH_STYLE;
    }
    this.client = new S3Client(config);
    this.bucket = env.S3_BUCKET!;
    this.ttl = env.S3_PRESIGN_TTL_SECONDS;
    this.maxBytes = env.UPLOAD_MAX_BYTES;
  }

  async presignUpload(params: {
    tenantId: string;
    kind: string;
    contentType: string;
  }): Promise<PresignedUpload> {
    const key = buildKey(params.tenantId, params.kind);
    const { url, fields } = await createPresignedPost(this.client, {
      Bucket: this.bucket,
      Key: key,
      // S3 edge-rejects anything outside this size range — the hard backstop
      // behind the client-side guard. The content-type is pinned via Fields
      // below (createPresignedPost auto-adds the matching equality condition,
      // so it must NOT be duplicated here or the policy can error).
      Conditions: [["content-length-range", 1, this.maxBytes]],
      Fields: { "Content-Type": params.contentType },
      Expires: this.ttl,
    });
    return { url, fields, key };
  }

  async presignDownload(key: string): Promise<{ downloadUrl: string }> {
    const downloadUrl = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: this.ttl },
    );
    return { downloadUrl };
  }
}

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [ENV],
      useFactory: (env: AppEnv): StorageProvider =>
        env.STORAGE_DRIVER === "s3"
          ? new S3StorageProvider(env)
          : new LocalStorageProvider(),
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
