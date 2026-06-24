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
  ResidentStatus,
  type ShortStaySummary,
  ShortStayStatus,
  UserRole,
} from "@pg/shared";
import { TenantContextService } from "../db/tenant-context";
import { beds, bookings, shortStays, users } from "../db/schema";
import { freeBed } from "../db/free-bed";
import { istStartOfDayUtc, istParts } from "../common/ist-date";

/** Whole-day count between two YYYY-MM-DD dates (check-out − check-in). */
function dayspan(checkIn: string, checkOut: string): number {
  const a = Date.parse(`${checkIn}T00:00:00Z`);
  const b = Date.parse(`${checkOut}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

@Injectable()
export class ShortStaysService {
  constructor(private readonly ctx: TenantContextService) {}

  /**
   * Assign a short-stay guest (a resident with `isShortStay`) to a bed. The
   * check-in/out dates, per-day charge, and total are read from the resident
   * record (captured at registration) — never the body. The bed may be:
   *  - VACANT: flipped straight to TRANSIENT, no booking attached; or
   *  - RESERVED for a future booking: the guest holds it in the interim, so the
   *    check-out must be strictly before that booking's move-in.
   * The guest is rent- and metering-exempt: this never creates an allocation.
   */
  async create(
    input: CreateShortStayInput,
    createdByUserId: string,
  ): Promise<{ id: string }> {
    const tenantId = this.ctx.currentTenantId()!;
    const db = this.ctx.db();

    const [resident] = await db
      .select({
        id: users.id,
        name: users.name,
        phone: users.phone,
        isShortStay: users.isShortStay,
        checkInDate: users.expectedMoveInDate,
        checkOutDate: users.shortStayCheckOutDate,
        perDayChargePaise: users.shortStayPerDayChargePaise,
      })
      .from(users)
      .where(
        and(eq(users.id, input.residentId), eq(users.role, UserRole.RESIDENT)),
      );
    if (!resident) throw new NotFoundException("Resident not found");
    if (!resident.isShortStay)
      throw new ConflictException("Resident is not a short-stay guest");
    if (
      !resident.checkInDate ||
      !resident.checkOutDate ||
      resident.perDayChargePaise == null
    )
      throw new UnprocessableEntityException(
        "Short-stay guest is missing check-in/out dates or per-day charge",
      );

    const checkInDate = resident.checkInDate;
    const checkOutDate = resident.checkOutDate;
    const perDayChargePaise = resident.perDayChargePaise;
    const feePaise = dayspan(checkInDate, checkOutDate) * perDayChargePaise;

    // Validate checkInDate >= today in IST
    const todayIst = istParts(new Date());
    const todayStr = `${todayIst.year}-${String(todayIst.month).padStart(2, "0")}-${String(todayIst.day).padStart(2, "0")}`;
    if (checkInDate < todayStr) {
      throw new BadRequestException("Check-in date cannot be in the past");
    }

    return db.transaction(async (tx) => {
      // At most one active stay per guest (the per-bed unique index guards the
      // bed; this guards the guest).
      const [existingStay] = await tx
        .select({ id: shortStays.id })
        .from(shortStays)
        .where(
          and(
            eq(shortStays.residentId, input.residentId),
            eq(shortStays.status, ShortStayStatus.ACTIVE),
          ),
        );
      if (existingStay)
        throw new ConflictException(
          "This guest already has an active short stay",
        );

      const [bed] = await tx
        .select({ id: beds.id, status: beds.status })
        .from(beds)
        .where(eq(beds.id, input.bedId));
      if (!bed) throw new NotFoundException("Bed not found");

      let bookingId: string | null = null;

      if (bed.status === BedStatus.RESERVED) {
        // Holding a reserved bed in the interim — must clear before move-in.
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
            "No pending booking found on this reserved bed",
          );
        }
        const moveInParts = istParts(booking.moveInDate);
        const moveInDateStr = `${moveInParts.year}-${String(moveInParts.month).padStart(2, "0")}-${String(moveInParts.day).padStart(2, "0")}`;
        if (checkOutDate >= moveInDateStr) {
          throw new UnprocessableEntityException(
            `Check-out date must be strictly before the booking's move-in date (${moveInDateStr})`,
          );
        }
        bookingId = booking.id;
      } else if (bed.status !== BedStatus.VACANT) {
        throw new ConflictException(
          "Bed must be vacant or reserved to host a short stay",
        );
      }

      // Flip bed VACANT/RESERVED → TRANSIENT (concurrency guard: only the exact
      // status we read above succeeds).
      const updated = await tx
        .update(beds)
        .set({ status: BedStatus.TRANSIENT })
        .where(and(eq(beds.id, input.bedId), eq(beds.status, bed.status)))
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
          residentId: input.residentId,
          bookingId,
          guestName: resident.name,
          guestPhone: resident.phone ?? null,
          perDayChargePaise,
          feePaise,
          checkInDate,
          checkOutDate,
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
        residentId: shortStays.residentId,
        bedId: shortStays.bedId,
        bedLabel: beds.label,
        bookingId: shortStays.bookingId,
        guestName: shortStays.guestName,
        guestPhone: shortStays.guestPhone,
        perDayChargePaise: shortStays.perDayChargePaise,
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
        .returning({ bedId: shortStays.bedId, residentId: shortStays.residentId });

      if (updated.length === 0) {
        const [existing] = await tx
          .select({ id: shortStays.id })
          .from(shortStays)
          .where(eq(shortStays.id, id));
        if (!existing) throw new NotFoundException("Short stay not found");
        throw new ConflictException("Short stay is not active");
      }

      await freeBed(tx, updated[0].bedId);
      await this.exitGuest(tx, updated[0].residentId);
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
        .returning({ bedId: shortStays.bedId, residentId: shortStays.residentId });

      if (updated.length === 0) {
        const [existing] = await tx
          .select({ id: shortStays.id })
          .from(shortStays)
          .where(eq(shortStays.id, id));
        if (!existing) throw new NotFoundException("Short stay not found");
        throw new ConflictException("Short stay is not active");
      }

      await freeBed(tx, updated[0].bedId);
      await this.exitGuest(tx, updated[0].residentId);
      return { cancelled: true };
    });
  }

  /**
   * Drop a short-stay guest off the active roster once their stay ends. Guarded
   * on `isShortStay` so it can never touch a long-term resident's status (a
   * short-stay bed never overlaps a long-term allocation, but this is the
   * belt-and-braces).
   */
  private async exitGuest(
    tx: Parameters<
      Parameters<ReturnType<TenantContextService["db"]>["transaction"]>[0]
    >[0],
    residentId: string,
  ): Promise<void> {
    await tx
      .update(users)
      .set({ status: ResidentStatus.EXITED })
      .where(
        and(
          eq(users.id, residentId),
          eq(users.role, UserRole.RESIDENT),
          eq(users.isShortStay, true),
        ),
      );
  }

  /** Called by the daily job. Completes all ACTIVE short stays whose checkOutDate is before today (IST). */
  async completeExpired(): Promise<number> {
    const db = this.ctx.db();
    const todayIst = istParts(istStartOfDayUtc(new Date()));
    const todayStr = `${todayIst.year}-${String(todayIst.month).padStart(2, "0")}-${String(todayIst.day).padStart(2, "0")}`;

    const expired = await db
      .select({
        id: shortStays.id,
        bedId: shortStays.bedId,
        residentId: shortStays.residentId,
      })
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
          await this.exitGuest(tx, row.residentId);
        });
        count++;
      } catch {
        // skip this row; it will be retried on next run
      }
    }
    return count;
  }
}
