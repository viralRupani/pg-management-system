import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { and, desc, eq, exists, inArray, isNull, or } from "drizzle-orm";
import {
  type AnnouncementAudience,
  type AnnouncementSummary,
  type CreateAnnouncementInput,
  ResidentStatus,
  UserRole,
} from "@pg/shared";
import { TenantContextService } from "../db/tenant-context";
import {
  allocations,
  announcementRecipients,
  announcements,
  beds,
  buildings,
  floors,
  rooms,
  users,
} from "../db/schema";
import { NotificationsService } from "../notifications/notifications.service";

/**
 * Announcements carry an audience. ALL is tenant-SHARED (every resident, the
 * default) — no recipient rows. SPECIFIC/SEGMENT resolve to a concrete active-
 * resident set at post time, which is persisted in `announcement_recipients`
 * (for the resident read filter) AND push-notified. Author is taken from the
 * JWT sub, never the body.
 */
@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    private readonly ctx: TenantContextService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Manager: post an announcement to the resolved audience. */
  async create(
    authorId: string,
    input: CreateAnnouncementInput,
  ): Promise<{ id: string }> {
    const { recipientIds, label } = await this.resolveAudience(input.audience);

    const [row] = await this.ctx
      .db()
      .insert(announcements)
      .values({
        tenantId: this.ctx.currentTenantId()!,
        title: input.title,
        body: input.body,
        audienceType: input.audience.type,
        audienceLabel: label,
        createdByUserId: authorId, // from JWT sub, never the body
      })
      .returning({ id: announcements.id });

    // SPECIFIC/SEGMENT persist explicit recipients; ALL stays globally visible.
    if (input.audience.type !== "ALL" && recipientIds.length > 0) {
      await this.ctx
        .db()
        .insert(announcementRecipients)
        .values(
          recipientIds.map((recipientUserId) => ({
            tenantId: this.ctx.currentTenantId()!,
            announcementId: row.id,
            recipientUserId,
          })),
        );
    }

    // Best-effort push fan-out — a notification failure must not roll back the
    // post (the announcement is already persisted and readable in-app).
    try {
      for (const recipientUserId of recipientIds) {
        await this.notifications.notify(recipientUserId, {
          type: "ANNOUNCEMENT",
          title: input.title,
          body: input.body,
        });
      }
    } catch (err) {
      this.logger.warn(
        `Announcement ${row.id} posted but notification fan-out failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    return { id: row.id };
  }

  /**
   * Resolve the audience to the concrete set of active residents it targets,
   * plus a human label for the manager list. ALL returns every active resident
   * (for the push fan-out) but writes no recipient rows.
   */
  private async resolveAudience(
    audience: AnnouncementAudience,
  ): Promise<{ recipientIds: string[]; label: string }> {
    const db = this.ctx.db();

    if (audience.type === "ALL") {
      const rows = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.role, UserRole.RESIDENT),
            eq(users.status, ResidentStatus.ACTIVE),
          ),
        );
      return { recipientIds: rows.map((r) => r.id), label: "Everyone" };
    }

    if (audience.type === "SPECIFIC") {
      const rows = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            inArray(users.id, audience.residentIds),
            eq(users.role, UserRole.RESIDENT),
          ),
        );
      const ids = rows.map((r) => r.id);
      if (ids.length === 0) {
        throw new BadRequestException("No valid residents selected");
      }
      return {
        recipientIds: ids,
        label: `${ids.length} selected resident${ids.length === 1 ? "" : "s"}`,
      };
    }

    // SEGMENT: active residents filtered by occupation and/or building.
    const conditions = [
      eq(users.role, UserRole.RESIDENT),
      eq(users.status, ResidentStatus.ACTIVE),
    ];
    if (audience.occupationType) {
      conditions.push(eq(users.occupationType, audience.occupationType));
    }

    let buildingName: string | null = null;
    if (audience.buildingId) {
      const [building] = await db
        .select({ name: buildings.name })
        .from(buildings)
        .where(eq(buildings.id, audience.buildingId));
      if (!building) throw new BadRequestException("Unknown building");
      buildingName = building.name;
      // Resident currently allocated to a bed in the given building.
      conditions.push(
        exists(
          db
            .select({ one: allocations.id })
            .from(allocations)
            .innerJoin(beds, eq(beds.id, allocations.bedId))
            .innerJoin(rooms, eq(rooms.id, beds.roomId))
            .innerJoin(floors, eq(floors.id, rooms.floorId))
            .where(
              and(
                eq(allocations.residentId, users.id),
                isNull(allocations.endDate),
                eq(floors.buildingId, audience.buildingId),
              ),
            ),
        ),
      );
    }

    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(and(...conditions));
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) {
      throw new BadRequestException("Segment matches no active residents");
    }
    return { recipientIds: ids, label: segmentLabel(audience, buildingName, ids.length) };
  }

  /**
   * Manager: every announcement (with audience info). Resident: only those
   * visible to them (ALL, or where they are an explicit recipient), with the
   * audience label stripped (audience size is manager-only info).
   */
  async list(userId: string, role: string): Promise<AnnouncementSummary[]> {
    const db = this.ctx.db();
    const isResident = role === UserRole.RESIDENT;

    const where = isResident
      ? or(
          eq(announcements.audienceType, "ALL"),
          exists(
            db
              .select({ one: announcementRecipients.id })
              .from(announcementRecipients)
              .where(
                and(
                  eq(announcementRecipients.announcementId, announcements.id),
                  eq(announcementRecipients.recipientUserId, userId),
                ),
              ),
          ),
        )
      : undefined;

    const rows = await db
      .select()
      .from(announcements)
      .where(where)
      .orderBy(desc(announcements.createdAt));

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      audienceType: r.audienceType,
      audienceLabel: isResident ? null : r.audienceLabel,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}

function segmentLabel(
  audience: Extract<AnnouncementAudience, { type: "SEGMENT" }>,
  buildingName: string | null,
  count: number,
): string {
  const parts: string[] = [];
  if (audience.occupationType) {
    parts.push(occupationLabel(audience.occupationType));
  }
  if (buildingName) parts.push(buildingName);
  const head = parts.length > 0 ? parts.join(" · ") : "All residents";
  return `${head} (${count})`;
}

function occupationLabel(occupation: string): string {
  switch (occupation) {
    case "STUDENT":
      return "Students";
    case "PROFESSIONAL":
      return "Professionals";
    default:
      return "Other";
  }
}
