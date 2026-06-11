import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  type ComplaintCategory,
  type ComplaintStatus as ComplaintStatusType,
  ComplaintStatus,
  type ComplaintSummary,
  type ComplaintUpdateEntry,
  type FileComplaintInput,
  type PresignedUploadResult,
  type UpdateComplaintStatusInput,
} from "@pg/shared";
import { TenantContextService } from "../db/tenant-context";
import { complaintUpdates, complaints, users } from "../db/schema";
import {
  STORAGE_PROVIDER,
  type StorageProvider,
  assertAllowedType,
} from "../storage/storage.module";

/**
 * Complaints are resident-OWNED: a resident files, lists, and comments only on
 * their own complaints (filtered by user_id = sub). Managers see/triage the
 * whole tenant. Status is a plain update (no irreversible side effect). The
 * thread author is always the JWT sub.
 */
@Injectable()
export class ComplaintsService {
  constructor(
    private readonly ctx: TenantContextService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /** Resident: presigned URL for a complaint photo. */
  async requestPhotoUrl(contentType: string): Promise<PresignedUploadResult> {
    assertAllowedType("complaints", contentType);
    return this.storage.presignUpload({
      tenantId: this.ctx.currentTenantId()!,
      kind: "complaints",
      contentType,
    });
  }

  /** Resident: file a complaint. */
  async file(
    residentId: string,
    input: FileComplaintInput,
  ): Promise<{ id: string }> {
    const [row] = await this.ctx
      .db()
      .insert(complaints)
      .values({
        tenantId: this.ctx.currentTenantId()!,
        residentId, // from JWT sub, never the body
        category: input.category,
        description: input.description,
        photoKey: input.photoKey ?? null,
        status: ComplaintStatus.OPEN,
      })
      .returning({ id: complaints.id });
    return { id: row.id };
  }

  /** Resident: their own complaints. Manager: pass undefined for all. */
  async list(residentId?: string): Promise<ComplaintSummary[]> {
    return this.query(
      residentId ? eq(complaints.residentId, residentId) : undefined,
    );
  }

  /** The complaint thread. Residents may only read their own complaint's. */
  async listUpdates(
    complaintId: string,
    residentId?: string,
  ): Promise<ComplaintUpdateEntry[]> {
    await this.assertVisible(complaintId, residentId);
    const rows = await this.ctx
      .db()
      .select()
      .from(complaintUpdates)
      .where(eq(complaintUpdates.complaintId, complaintId))
      .orderBy(asc(complaintUpdates.createdAt));
    return rows.map((r) => ({
      id: r.id,
      authorUserId: r.authorUserId,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Add a note to the thread. Residents may only post to their own complaint. */
  async addUpdate(
    complaintId: string,
    authorUserId: string,
    note: string,
    residentId?: string,
  ): Promise<{ id: string }> {
    await this.assertVisible(complaintId, residentId);
    const [row] = await this.ctx
      .db()
      .insert(complaintUpdates)
      .values({
        tenantId: this.ctx.currentTenantId()!,
        complaintId,
        authorUserId, // from JWT sub
        note,
      })
      .returning({ id: complaintUpdates.id });
    return { id: row.id };
  }

  /** Manager: change status (and optionally self-assign). */
  async updateStatus(
    complaintId: string,
    managerId: string,
    input: UpdateComplaintStatusInput,
  ): Promise<{ status: ComplaintStatusType }> {
    const [row] = await this.ctx
      .db()
      .update(complaints)
      .set({
        status: input.status,
        resolvedAt:
          input.status === ComplaintStatus.RESOLVED ? new Date() : null,
        ...(input.assignToSelf ? { assignedToUserId: managerId } : {}),
      })
      .where(eq(complaints.id, complaintId))
      .returning({ status: complaints.status });
    if (!row) throw new NotFoundException("Complaint not found");
    return { status: row.status as ComplaintStatusType };
  }

  /**
   * Confirm the caller may see this complaint. A manager (residentId undefined)
   * sees any in-tenant complaint; a resident must own it (user_id = sub).
   */
  private async assertVisible(
    complaintId: string,
    residentId?: string,
  ): Promise<void> {
    const where = residentId
      ? and(
          eq(complaints.id, complaintId),
          eq(complaints.residentId, residentId),
        )
      : eq(complaints.id, complaintId);
    const [row] = await this.ctx
      .db()
      .select({ id: complaints.id })
      .from(complaints)
      .where(where);
    if (!row) throw new NotFoundException("Complaint not found");
  }

  private async query(
    where?: ReturnType<typeof eq>,
  ): Promise<ComplaintSummary[]> {
    const base = this.ctx
      .db()
      .select({
        id: complaints.id,
        residentId: complaints.residentId,
        residentName: users.name,
        category: complaints.category,
        description: complaints.description,
        status: complaints.status,
        assignedToUserId: complaints.assignedToUserId,
        photoKey: complaints.photoKey,
        createdAt: complaints.createdAt,
      })
      .from(complaints)
      .innerJoin(users, eq(users.id, complaints.residentId))
      .orderBy(desc(complaints.createdAt));
    const rows = where ? await base.where(where) : await base;
    return rows.map((r) => ({
      id: r.id,
      residentId: r.residentId,
      residentName: r.residentName,
      category: r.category as ComplaintCategory,
      description: r.description,
      status: r.status as ComplaintStatusType,
      assignedToUserId: r.assignedToUserId,
      photoKey: r.photoKey,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * Presigned download URL for a complaint's photo (if any). Manager
   * (residentId undefined) reads any in-tenant complaint; a resident must own it.
   */
  async getPhotoUrl(
    complaintId: string,
    residentId?: string,
  ): Promise<{ downloadUrl: string }> {
    const where = residentId
      ? and(
          eq(complaints.id, complaintId),
          eq(complaints.residentId, residentId),
        )
      : eq(complaints.id, complaintId);
    const [row] = await this.ctx
      .db()
      .select({ key: complaints.photoKey })
      .from(complaints)
      .where(where);
    if (!row) throw new NotFoundException("Complaint not found");
    if (!row.key) throw new NotFoundException("No photo on this complaint");
    return this.storage.presignDownload(row.key);
  }
}
