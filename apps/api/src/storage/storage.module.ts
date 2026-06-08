import { Global, Module } from "@nestjs/common";
import { randomUUID } from "node:crypto";

export const STORAGE_PROVIDER = Symbol("STORAGE_PROVIDER");

export interface PresignedUpload {
  /** Where the client PUTs the bytes directly (never proxied through the API). */
  uploadUrl: string;
  /** The opaque object key persisted on the row (payments.screenshot_key, etc.). */
  key: string;
}

/**
 * File storage seam. Production = AWS S3 presigned URLs (client uploads/downloads
 * direct; the API only ever handles keys). For local dev we use a stub that
 * returns deterministic URLs and tenant-namespaced keys — same key shape as S3,
 * so swapping in the real driver touches nothing else. Mirrors the SmsProvider
 * stub pattern.
 */
export interface StorageProvider {
  presignUpload(params: {
    tenantId: string;
    kind: string; // e.g. "payments", "kyc"
    contentType?: string;
  }): Promise<PresignedUpload>;
  presignDownload(key: string): Promise<{ downloadUrl: string }>;
}

class LocalStorageProvider implements StorageProvider {
  private readonly base = "https://stub-storage.local";

  async presignUpload(params: {
    tenantId: string;
    kind: string;
  }): Promise<PresignedUpload> {
    // Tenant-namespaced key so the real S3 layout is correct from day one.
    const key = `${params.tenantId}/${params.kind}/${randomUUID()}`;
    return { uploadUrl: `${this.base}/upload/${key}`, key };
  }

  async presignDownload(key: string): Promise<{ downloadUrl: string }> {
    return { downloadUrl: `${this.base}/download/${key}` };
  }
}

@Global()
@Module({
  providers: [{ provide: STORAGE_PROVIDER, useClass: LocalStorageProvider }],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
