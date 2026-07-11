import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  BedStatus,
  BookingStatus,
  type BookingSummary,
  type CreateBookingInput,
  DepositStatus,
  ResidentStatus,
  ShortStayStatus,
  UserRole,
} from "@pg/shared";
import { TenantContextService } from "../db/tenant-context";
import { allocations, beds, bookings, deposits, shortStays, users } from "../db/schema";
import { isUniqueViolation, pgConstraintName } from "../db/pg-errors";
import { istStartOfDayUtc } from "../common/ist-date";
import { qualifyReferralIfAny } from "../referrals/qualify-referral";

/**
 * Future-dated bed bookings. A manager holds a bed for an incoming resident and
 * records the deposit before the move-in date; the bed is held (shown occupied —
 * RESERVED if it was vacant, left OCCUPIED if the sitting resident hasn't left
 * yet) and NO allocation/billing happens until activation. `activateDue()` is the
 * per-tenant primitive the daily job runs to turn a due booking into a real
 * allocation. Concurrency safety mirrors the rest of the app: conditional status
 * flips first, and the `bookings_pending_bed_unique` + allocation partial indexes
 * are the hard double-book backstop.
 */
@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(private readonly ctx: TenantContextService) {}

  async create(
    input: CreateBookingInput,
    createdByUserId: string,
  ): Promise<{ id: string }> {
    const tenantId = this.ctx.currentTenantId()!;
    const db = this.ctx.db();

    // Clean errors for the common cases; DB indexes are the real guarantee.
    const [resident] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(eq(users.id, input.residentId), eq(users.role, UserRole.RESIDENT)),
      );
    if (!resident) throw new NotFoundException("Resident not found");

    const [activeAlloc] = await db
      .select({ id: allocations.id })
      .from(allocations)
      .where(
        and(
          eq(allocations.residentId, input.residentId),
          isNull(allocations.endDate),
        ),
      );
    if (activeAlloc)
      throw new ConflictException(
        "Resident already has an active allocation; use a room transfer instead",
      );

    const [bedExists] = await db
      .select({ id: beds.id })
      .from(beds)
      .where(eq(beds.id, input.bedId));
    if (!bedExists) throw new NotFoundException("Bed not found");

    const moveInDate = new Date(input.moveInDate);

    try {
      return await db.transaction(async (tx) => {
        // Hold the bed entirely from inside the txn (never branch on a stale
        // pre-txn read). Try to reserve a VACANT bed; if that flips 0 rows,
        // re-read: an OCCUPIED bed (sitting resident leaving soon) is left as-is
        // — the booking row + partial-unique index are the hold either way —
        // while a RESERVED/missing bed is rejected. This closes the
        // OCCUPIED↔VACANT race a concurrent settleExit could otherwise open.
        const held = await tx
          .update(beds)
          .set({ status: BedStatus.RESERVED })
          .where(
            and(eq(beds.id, input.bedId), eq(beds.status, BedStatus.VACANT)),
          )
          .returning({ id: beds.id });
        if (held.length !== 1) {
          const [bed] = await tx
            .select({ status: beds.status })
            .from(beds)
            .where(eq(beds.id, input.bedId));
          if (!bed) throw new NotFoundException("Bed not found");
          if (bed.status !== BedStatus.OCCUPIED)
            throw new ConflictException("Bed already has a pending booking");
        }

        // Reuse a deposit the manager already recorded for this resident (e.g.
        // from the profile, before a bed was picked) rather than trying to
        // create a second one — the one-deposit-per-resident constraint would
        // reject that regardless of amount. A reused deposit isn't owned by
        // this booking, so `cancel()` must leave it alone.
        const [existingDeposit] = await tx
          .select({ id: deposits.id })
          .from(deposits)
          .where(eq(deposits.residentId, input.residentId));

        let depositId: string;
        let depositOwned: boolean;
        if (existingDeposit) {
          depositId = existingDeposit.id;
          depositOwned = false;
        } else {
          const [deposit] = await tx
            .insert(deposits)
            .values({
              tenantId,
              residentId: input.residentId,
              amountPaise: input.depositAmountPaise,
              status: DepositStatus.HELD,
            })
            .returning({ id: deposits.id });
          depositId = deposit.id;
          depositOwned = true;
        }

        // The incoming resident shows as UPCOMING until move-in.
        await tx
          .update(users)
          .set({ status: ResidentStatus.UPCOMING })
          .where(
            and(
              eq(users.id, input.residentId),
              eq(users.role, UserRole.RESIDENT),
            ),
          );

        const [booking] = await tx
          .insert(bookings)
          .values({
            tenantId,
            residentId: input.residentId,
            bedId: input.bedId,
            moveInDate,
            depositId,
            depositOwned,
            status: BookingStatus.PENDING,
            createdByUserId,
          })
          .returning({ id: bookings.id });

        return { id: booking.id };
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const constraint = pgConstraintName(err);
        if (constraint === "deposits_resident_id_unique")
          throw new ConflictException(
            "A deposit is already recorded for this resident",
          );
        throw new ConflictException("Bed already has a pending booking");
      }
      throw err;
    }
  }

  /** Manager: bookings (newest first) with resident name + bed label. */
  async list(): Promise<BookingSummary[]> {
    const rows = await this.ctx
      .db()
      .select({
        id: bookings.id,
        residentId: bookings.residentId,
        residentName: users.name,
        bedId: bookings.bedId,
        bedLabel: beds.label,
        moveInDate: bookings.moveInDate,
        depositAmountPaise: deposits.amountPaise,
        status: bookings.status,
        createdAt: bookings.createdAt,
        activatedAt: bookings.activatedAt,
      })
      .from(bookings)
      .innerJoin(users, eq(users.id, bookings.residentId))
      .innerJoin(beds, eq(beds.id, bookings.bedId))
      .leftJoin(deposits, eq(deposits.id, bookings.depositId))
      .orderBy(desc(bookings.createdAt));

    return rows.map((r) => ({
      id: r.id,
      residentId: r.residentId,
      residentName: r.residentName,
      bedId: r.bedId,
      bedLabel: r.bedLabel,
      moveInDate: r.moveInDate.toISOString(),
      depositAmountPaise: r.depositAmountPaise ?? 0,
      status: r.status as BookingStatus,
      createdAt: r.createdAt.toISOString(),
      activatedAt: r.activatedAt ? r.activatedAt.toISOString() : null,
    }));
  }

  /**
   * Manager: drop a PENDING booking (conditional flip — concurrency-safe). A
   * true undo: frees a RESERVED bed back to VACANT (an OCCUPIED bed belongs to
   * the sitting resident and is left alone), returns the resident to ACTIVE,
   * and — only if THIS booking created the deposit (`depositOwned`) — removes
   * it too (it's pristine: an un-activated booking's resident is never ACTIVE,
   * so `settleExit` can't have written a ledger against it). A deposit the
   * manager had already recorded before this booking is left on the resident's
   * record untouched; only the link is dropped. Returning the cash is the
   * manager's offline concern.
   */
  async cancel(id: string): Promise<{ cancelled: boolean }> {
    const db = this.ctx.db();
    return db.transaction(async (tx) => {
      const cancelled = await tx
        .update(bookings)
        .set({ status: BookingStatus.CANCELLED, cancelledAt: new Date() })
        .where(
          and(
            eq(bookings.id, id),
            eq(bookings.status, BookingStatus.PENDING),
          ),
        )
        .returning({
          residentId: bookings.residentId,
          bedId: bookings.bedId,
          depositId: bookings.depositId,
          depositOwned: bookings.depositOwned,
        });
      if (cancelled.length !== 1) {
        const [exists] = await tx
          .select({ status: bookings.status })
          .from(bookings)
          .where(eq(bookings.id, id));
        if (!exists) throw new NotFoundException("Booking not found");
        throw new ConflictException(
          `Booking already ${exists.status.toLowerCase()}`,
        );
      }

      // Guard: reject if an active short stay is using the bed reserved for this booking.
      const [activeShortStay] = await tx
        .select({ id: shortStays.id })
        .from(shortStays)
        .where(
          and(
            eq(shortStays.bookingId, id),
            eq(shortStays.status, ShortStayStatus.ACTIVE),
          ),
        );
      if (activeShortStay) {
        throw new ConflictException(
          "Complete or cancel the active short stay before cancelling this booking",
        );
      }

      const { residentId, bedId, depositId, depositOwned } = cancelled[0];
      await tx
        .update(beds)
        .set({ status: BedStatus.VACANT })
        .where(and(eq(beds.id, bedId), eq(beds.status, BedStatus.RESERVED)));
      await tx
        .update(users)
        .set({ status: ResidentStatus.ACTIVE })
        .where(
          and(
            eq(users.id, residentId),
            eq(users.role, UserRole.RESIDENT),
            eq(users.status, ResidentStatus.UPCOMING),
          ),
        );
      if (depositId && depositOwned) {
        // Null only the booking's deposit_id first (a single-column update — the
        // composite FK's ON DELETE SET NULL would otherwise null tenant_id too),
        // then drop the pristine held deposit.
        await tx
          .update(bookings)
          .set({ depositId: null })
          .where(eq(bookings.id, id));
        await tx.delete(deposits).where(eq(deposits.id, depositId));
      }
      return { cancelled: true };
    });
  }

  /**
   * Activate every PENDING booking whose move-in IST day has arrived: create the
   * real allocation (startDate = moveInDate), flip the bed to OCCUPIED, and flip
   * the resident to ACTIVE. A bed still OCCUPIED by a not-yet-exited resident is
   * skipped (left PENDING) until that exit frees it. Called per-tenant by the
   * daily job inside the tenant's RLS context. Returns the count activated.
   */
  async activateDue(): Promise<number> {
    const tenantId = this.ctx.currentTenantId()!;
    const db = this.ctx.db();
    const today = istStartOfDayUtc(new Date()).getTime();

    const pending = await db
      .select({
        id: bookings.id,
        bedId: bookings.bedId,
        residentId: bookings.residentId,
        moveInDate: bookings.moveInDate,
      })
      .from(bookings)
      .where(eq(bookings.status, BookingStatus.PENDING));

    let activated = 0;
    for (const b of pending) {
      if (istStartOfDayUtc(b.moveInDate).getTime() > today) continue; // not yet
      try {
        const done = await db.transaction(async (tx) => {
          // Don't displace a sitting resident: only RESERVED/VACANT beds activate.
          const [bed] = await tx
            .select({ status: beds.status })
            .from(beds)
            .where(eq(beds.id, b.bedId));
          if (
            !bed ||
            bed.status === BedStatus.OCCUPIED ||
            bed.status === BedStatus.TRANSIENT
          )
            return false;

          const flipped = await tx
            .update(bookings)
            .set({
              status: BookingStatus.ACTIVATED,
              activatedAt: new Date(),
            })
            .where(
              and(
                eq(bookings.id, b.id),
                eq(bookings.status, BookingStatus.PENDING),
              ),
            )
            .returning({ id: bookings.id });
          if (flipped.length !== 1) return false; // raced

          await tx
            .update(beds)
            .set({ status: BedStatus.OCCUPIED })
            .where(eq(beds.id, b.bedId));
          await tx.insert(allocations).values({
            tenantId,
            bedId: b.bedId,
            residentId: b.residentId,
            startDate: b.moveInDate,
          });
          await tx
            .update(users)
            .set({ status: ResidentStatus.ACTIVE })
            .where(
              and(
                eq(users.id, b.residentId),
                eq(users.role, UserRole.RESIDENT),
              ),
            );

          // Refer & earn: this booking activating is this resident's
          // first-ever allocation, same earn moment as an immediate move-in.
          await qualifyReferralIfAny(tx, tenantId, b.residentId);

          return true;
        });
        if (done) activated++;
      } catch (err) {
        // A raced allocation (bed/resident already active) surfaces as a unique
        // violation — skip this booking, don't abort the batch.
        if (isUniqueViolation(err)) {
          this.logger.warn(
            `Skipped activating booking ${b.id}: allocation conflict`,
          );
          continue;
        }
        throw err;
      }
    }
    return activated;
  }
}
