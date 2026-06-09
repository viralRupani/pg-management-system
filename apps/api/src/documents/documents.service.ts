import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, ne } from "drizzle-orm";
import {
  type DocumentSummary,
  DocumentStatus,
  type DocumentType,
  type PresignedUploadResult,
  type SubmitDocumentInput,
} from "@pg/shared";
import { TenantContextService } from "../db/tenant-context";
import { documents, users } from "../db/schema";
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from "../storage/storage.module";

/**
 * KYC / security documents. Resident uploads (presigned S3), manager verifies or
 * rejects (PENDING -> VERIFIED | REJECTED, guarded). Resident reads filter by
 * user_id = sub; manager reads see the whole tenant.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly ctx: TenantContextService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /** Resident: presigned URL to upload a KYC file. */
  async requestUploadUrl(): Promise<PresignedUploadResult> {
    return this.storage.presignUpload({
      tenantId: this.ctx.currentTenantId()!,
      kind: "kyc",
    });
  }

  /**
   * Resident: register an uploaded document for review. At most one document per
   * type per resident (unique on tenant_id+resident_id+type) — a re-submit
   * replaces the existing row in place and resets it to PENDING for re-review
   * (the "ask for re-upload" loop). An already-VERIFIED document is never
   * silently un-verified: the conflict update is guarded on status <> VERIFIED,
   * so re-submitting a verified doc matches 0 rows and 409s.
   */
  async submit(
    residentId: string,
    input: SubmitDocumentInput,
  ): Promise<{ id: string }> {
    const [row] = await this.ctx
      .db()
      .insert(documents)
      .values({
        tenantId: this.ctx.currentTenantId()!,
        residentId, // from JWT sub, never the body
        type: input.type,
        s3Key: input.s3Key,
        status: DocumentStatus.PENDING,
      })
      .onConflictDoUpdate({
        target: [documents.tenantId, documents.residentId, documents.type],
        set: {
          s3Key: input.s3Key,
          status: DocumentStatus.PENDING,
          reviewNote: null,
          reviewedByUserId: null,
          reviewedAt: null,
        },
        setWhere: ne(documents.status, DocumentStatus.VERIFIED),
      })
      .returning({ id: documents.id });
    if (!row) {
      throw new ConflictException(
        "This document is already verified and cannot be replaced",
      );
    }
    return { id: row.id };
  }

  /** Resident: their own documents. */
  async listMine(residentId: string): Promise<DocumentSummary[]> {
    return this.query(eq(documents.residentId, residentId));
  }

  /** Manager: all documents in the tenant. */
  async listAll(): Promise<DocumentSummary[]> {
    return this.query();
  }

  /** Manager: presigned download URL for a document. */
  async getDownloadUrl(id: string): Promise<{ downloadUrl: string }> {
    const [d] = await this.ctx
      .db()
      .select({ key: documents.s3Key })
      .from(documents)
      .where(eq(documents.id, id));
    if (!d) throw new NotFoundException("Document not found");
    return this.storage.presignDownload(d.key);
  }

  /** Manager: mark a PENDING document VERIFIED. */
  async verify(id: string, reviewerId: string): Promise<{ status: string }> {
    return this.review(id, reviewerId, DocumentStatus.VERIFIED);
  }

  /** Manager: reject a PENDING document with a note. */
  async reject(
    id: string,
    reviewerId: string,
    note: string,
  ): Promise<{ status: string }> {
    return this.review(id, reviewerId, DocumentStatus.REJECTED, note);
  }

  private async review(
    id: string,
    reviewerId: string,
    decision: typeof DocumentStatus.VERIFIED | typeof DocumentStatus.REJECTED,
    note?: string,
  ): Promise<{ status: string }> {
    const db = this.ctx.db();
    return db.transaction(async (tx) => {
      // Conditional flip: only a PENDING document can be decided. A concurrent
      // or repeat review matches 0 rows and bails — not select-then-update,
      // which races under READ COMMITTED (see DepositsService.settleExit).
      const decided = await tx
        .update(documents)
        .set({
          status: decision,
          reviewNote: note ?? null,
          reviewedByUserId: reviewerId,
          reviewedAt: new Date(),
        })
        .where(
          and(eq(documents.id, id), eq(documents.status, DocumentStatus.PENDING)),
        )
        .returning({ id: documents.id });
      if (decided.length !== 1) {
        const [exists] = await tx
          .select({ status: documents.status })
          .from(documents)
          .where(eq(documents.id, id));
        if (!exists) throw new NotFoundException("Document not found");
        throw new ConflictException(
          `Document already ${exists.status.toLowerCase()}`,
        );
      }
      return { status: decision };
    });
  }

  private async query(
    where?: ReturnType<typeof eq>,
  ): Promise<DocumentSummary[]> {
    const base = this.ctx
      .db()
      .select({
        id: documents.id,
        residentId: documents.residentId,
        residentName: users.name,
        type: documents.type,
        status: documents.status,
        reviewNote: documents.reviewNote,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .innerJoin(users, eq(users.id, documents.residentId))
      .orderBy(desc(documents.createdAt));
    const rows = where ? await base.where(where) : await base;
    return rows.map((r) => ({
      id: r.id,
      residentId: r.residentId,
      residentName: r.residentName,
      type: r.type as DocumentType,
      status: r.status as DocumentStatus,
      reviewNote: r.reviewNote,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
