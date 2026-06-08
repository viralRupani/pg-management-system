import { Injectable } from "@nestjs/common";
import { desc } from "drizzle-orm";
import {
  type AnnouncementSummary,
  type CreateAnnouncementInput,
} from "@pg/shared";
import { TenantContextService } from "../db/tenant-context";
import { announcements } from "../db/schema";

/**
 * Announcements are tenant-SHARED: every resident sees every announcement, so
 * reads are NOT user-filtered — RLS tenant-scoping is the whole isolation
 * requirement. Author is taken from the JWT sub, never the body.
 */
@Injectable()
export class AnnouncementsService {
  constructor(private readonly ctx: TenantContextService) {}

  /** Manager: broadcast a new announcement. */
  async create(
    authorId: string,
    input: CreateAnnouncementInput,
  ): Promise<{ id: string }> {
    const [row] = await this.ctx
      .db()
      .insert(announcements)
      .values({
        tenantId: this.ctx.currentTenantId()!,
        title: input.title,
        body: input.body,
        createdByUserId: authorId, // from JWT sub, never the body
      })
      .returning({ id: announcements.id });
    return { id: row.id };
  }

  /** Anyone in the tenant: every announcement, newest first. */
  async list(): Promise<AnnouncementSummary[]> {
    const rows = await this.ctx
      .db()
      .select()
      .from(announcements)
      .orderBy(desc(announcements.createdAt));
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
