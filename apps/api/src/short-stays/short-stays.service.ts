import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, eq, lt } from "drizzle-orm";
import {
  BedStatus,
  BookingStatus,
  type CreateShortStayInput,
  type ShortStaySummary,
  ShortStayStatus,
} from "@pg/shared";
import { TenantContextService } from "../db/tenant-context";
import { beds, bookings, shortStays } from "../db/schema";
import { freeBed } from "../db/free-bed";
import { istStartOfDayUtc, istParts } from "../common/ist-date";

@Injectable()
export class ShortStaysService {
  constructor(private readonly ctx: TenantContextService) {}

  async create(
    input: CreateShortStayInput,
    createdByUserId: string,
  ): Promise<{ id: string }> {
    const tenantId = this.ctx.currentTenantId()!;
    const db = this.ctx.db();

    // Validate checkInDate >= today in IST
    const todayIst = istParts(new Date());
    const todayStr = `${todayIst.year}-${String(todayIst.month).padStart(2, "0")}-${String(todayIst.day).padStart(2, "0")}`;
    if (input.checkInDate < todayStr) {
      throw new BadRequestException("Check-in date cannot be in the past");
    }

    return db.transaction(async (tx) => {
      // Verify bed exists and is RESERVED
      const [bed] = await tx
        .select({ id: beds.id, status: beds.status })
        .from(beds)
        .where(eq(beds.id, input.bedId));
      if (!bed) throw new NotFoundException("Bed not found");
      if (bed.status !== BedStatus.RESERVED) {
        throw new ConflictException(
          "Bed must be RESERVED to host a short stay",
        );
      }

      // Find the pending booking on this bed (provides moveInDate for validation)
      const [booking] = await tx
        .select({ id: bookings.id, moveInDate: bookings.moveInDate })
        .from(bookings)
        .where(
          and(
            eq(bookings.bedId, input.bedId),
            eq(bookings.status, BookingStatus.PENDING),
          ),
        );
      if (!booking) {
        throw new ConflictException(
          "No pending booking found on this bed — short stays require a reserved booking",
        );
      }

      // Validate checkOutDate is strictly before the booking's moveInDate (IST calendar)
      const moveInParts = istParts(booking.moveInDate);
      const moveInDateStr = `${moveInParts.year}-${String(moveInParts.month).padStart(2, "0")}-${String(moveInParts.day).padStart(2, "0")}`;
      if (input.checkOutDate >= moveInDateStr) {
        throw new UnprocessableEntityException(
          `Check-out date must be strictly before the booking's move-in date (${moveInDateStr})`,
        );
      }

      // Flip bed RESERVED → TRANSIENT (concurrency guard)
      const updated = await tx
        .update(beds)
        .set({ status: BedStatus.TRANSIENT })
        .where(and(eq(beds.id, input.bedId), eq(beds.status, BedStatus.RESERVED)))
        .returning({ id: beds.id });
      if (updated.length === 0) {
        throw new ConflictException(
          "Bed status changed concurrently — please try again",
        );
      }

      const [row] = await tx
        .insert(shortStays)
        .values({
          tenantId,
          bedId: input.bedId,
          bookingId: booking.id,
          guestName: input.guestName,
          guestPhone: input.guestPhone ?? null,
          feePaise: input.feePaise,
          checkInDate: input.checkInDate,
          checkOutDate: input.checkOutDate,
          status: ShortStayStatus.ACTIVE,
          createdByUserId,
        })
        .returning({ id: shortStays.id });

      return { id: row.id };
    });
  }

  async list(): Promise<ShortStaySummary[]> {
    const db = this.ctx.db();
    const rows = await db
      .select({
        id: shortStays.id,
        bedId: shortStays.bedId,
        bedLabel: beds.label,
        bookingId: shortStays.bookingId,
        guestName: shortStays.guestName,
        guestPhone: shortStays.guestPhone,
        feePaise: shortStays.feePaise,
        checkInDate: shortStays.checkInDate,
        checkOutDate: shortStays.checkOutDate,
        status: shortStays.status,
        createdAt: shortStays.createdAt,
        completedAt: shortStays.completedAt,
        cancelledAt: shortStays.cancelledAt,
      })
      .from(shortStays)
      .innerJoin(beds, eq(shortStays.bedId, beds.id))
      .orderBy(shortStays.createdAt);

    return rows.map((r) => ({
      ...r,
      status: r.status as ShortStayStatus,
      createdAt: r.createdAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
      cancelledAt: r.cancelledAt?.toISOString() ?? null,
    }));
  }

  async complete(id: string): Promise<{ completed: boolean }> {
    const db = this.ctx.db();
    return db.transaction(async (tx) => {
      const updated = await tx
        .update(shortStays)
        .set({ status: ShortStayStatus.COMPLETED, completedAt: new Date() })
        .where(
          and(eq(shortStays.id, id), eq(shortStays.status, ShortStayStatus.ACTIVE)),
        )
        .returning({ bedId: shortStays.bedId });

      if (updated.length === 0) {
        const [existing] = await tx
          .select({ id: shortStays.id })
          .from(shortStays)
          .where(eq(shortStays.id, id));
        if (!existing) throw new NotFoundException("Short stay not found");
        throw new ConflictException("Short stay is not active");
      }

      await freeBed(tx, updated[0].bedId);
      return { completed: true };
    });
  }

  async cancel(id: string): Promise<{ cancelled: boolean }> {
    const db = this.ctx.db();
    return db.transaction(async (tx) => {
      const updated = await tx
        .update(shortStays)
        .set({ status: ShortStayStatus.CANCELLED, cancelledAt: new Date() })
        .where(
          and(eq(shortStays.id, id), eq(shortStays.status, ShortStayStatus.ACTIVE)),
        )
        .returning({ bedId: shortStays.bedId });

      if (updated.length === 0) {
        const [existing] = await tx
          .select({ id: shortStays.id })
          .from(shortStays)
          .where(eq(shortStays.id, id));
        if (!existing) throw new NotFoundException("Short stay not found");
        throw new ConflictException("Short stay is not active");
      }

      await freeBed(tx, updated[0].bedId);
      return { cancelled: true };
    });
  }

  /** Called by the daily job. Completes all ACTIVE short stays whose checkOutDate is before today (IST). */
  async completeExpired(): Promise<number> {
    const db = this.ctx.db();
    const todayIst = istParts(istStartOfDayUtc(new Date()));
    const todayStr = `${todayIst.year}-${String(todayIst.month).padStart(2, "0")}-${String(todayIst.day).padStart(2, "0")}`;

    const expired = await db
      .select({ id: shortStays.id, bedId: shortStays.bedId })
      .from(shortStays)
      .where(
        and(
          eq(shortStays.status, ShortStayStatus.ACTIVE),
          lt(shortStays.checkOutDate, todayStr),
        ),
      );

    let count = 0;
    for (const row of expired) {
      try {
        await db.transaction(async (tx) => {
          const updated = await tx
            .update(shortStays)
            .set({ status: ShortStayStatus.COMPLETED, completedAt: new Date() })
            .where(
              and(
                eq(shortStays.id, row.id),
                eq(shortStays.status, ShortStayStatus.ACTIVE),
              ),
            )
            .returning({ id: shortStays.id });
          if (updated.length === 0) return; // already handled by a concurrent run
          await freeBed(tx, row.bedId);
        });
        count++;
      } catch {
        // skip this row; it will be retried on next run
      }
    }
    return count;
  }
}
