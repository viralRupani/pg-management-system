import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  type AllocateBedInput,
  type AllocationSummary,
  type AvailableBed,
  BedStatus,
  BookingStatus,
  type CreateTransferRequestInput,
  type EligibleBed,
  type ExitingBed,
  type OccupationType,
  type TransferRequestSummary,
  TransferRequestStatus,
  UserRole,
} from "@pg/shared";
import { TenantContextService } from "../db/tenant-context";
import {
  allocations,
  beds,
  bookings,
  invoices,
  rentAdjustments,
  rooms,
  transferRequests,
  users,
} from "../db/schema";
import { istParts, istPeriod, istStartOfDayUtc } from "../common/ist-date";
import { freeBed } from "../db/free-bed";
import { isUniqueViolation } from "../db/pg-errors";
import { prorateSegment } from "../rent/rent.proration";
import { InvoiceScheduleService } from "../rent/invoice-schedule.service";

/** Drizzle transaction handle (the arg to `db.transaction(async (tx) => …)`). */
type Tx = Parameters<
  Parameters<ReturnType<TenantContextService["db"]>["transaction"]>[0]
>[0];

/**
 * Bed allocation. `allocations` (active row = end_date IS NULL) is the source of
 * truth; `beds.status` is a convenience mirror mutated in the same transaction.
 * The two partial-unique indexes are the hard backstop against double-booking,
 * so even a concurrent racing allocate cannot place two residents on one bed.
 */
@Injectable()
export class AllocationService {
  private readonly logger = new Logger(AllocationService.name);

  constructor(
    private readonly ctx: TenantContextService,
    private readonly invoiceSchedule: InvoiceScheduleService,
  ) {}

  async allocate(input: AllocateBedInput): Promise<{ id: string }> {
    const tenantId = this.ctx.currentTenantId()!;
    const db = this.ctx.db();

    // Clean errors for the common cases; DB indexes are the real guarantee.
    const [bed] = await db.select().from(beds).where(eq(beds.id, input.bedId));
    if (!bed) throw new NotFoundException("Bed not found");
    if (bed.status !== BedStatus.VACANT)
      throw new ConflictException("Bed is not vacant");

    const [resident] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(eq(users.id, input.residentId), eq(users.role, UserRole.RESIDENT)),
      );
    if (!resident) throw new NotFoundException("Resident not found");

    const startDate = input.startDate ? new Date(input.startDate) : new Date();

    let result: { id: string };
    try {
      result = await db.transaction(async (tx) => {
        const [alloc] = await tx
          .insert(allocations)
          .values({
            tenantId,
            bedId: input.bedId,
            residentId: input.residentId,
            startDate,
          })
          .returning();

        await tx
          .update(beds)
          .set({ status: BedStatus.OCCUPIED })
          .where(eq(beds.id, input.bedId));

        return { id: alloc.id };
      });
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException(
          "Bed or resident already has an active allocation",
        );
      throw err;
    }

    // Live move-in after the PG's scheduled generation moment for this period has
    // already passed → the tenant-wide run has already skipped this resident, so
    // bill them now. Best-effort: a failure here (its own savepoint rolls back)
    // must never fail the allocation itself.
    try {
      await this.invoiceSchedule.generateForResidentIfDue(
        input.residentId,
        startDate,
      );
    } catch (err) {
      this.logger.warn(
        `Late-join invoice generation failed for resident ${input.residentId}: ${err}`,
      );
    }

    return result;
  }

  /** End the resident's active allocation and free the bed. */
  async moveOut(residentId: string): Promise<{ ended: boolean }> {
    const db = this.ctx.db();
    return db.transaction(async (tx) => {
      const [active] = await tx
        .select()
        .from(allocations)
        .where(
          and(
            eq(allocations.residentId, residentId),
            isNull(allocations.endDate),
          ),
        );
      if (!active)
        throw new NotFoundException("No active allocation for this resident");

      await tx
        .update(allocations)
        .set({ endDate: new Date() })
        .where(eq(allocations.id, active.id));
      // Hand the bed to a waiting booking (→ RESERVED) or free it (→ VACANT).
      await freeBed(tx, active.bedId);

      return { ended: true };
    });
  }

  /** Currently active allocations with bed label + resident name. */
  async listActive(): Promise<AllocationSummary[]> {
    const rows = await this.ctx
      .db()
      .select({
        id: allocations.id,
        bedId: allocations.bedId,
        bedLabel: beds.label,
        residentId: allocations.residentId,
        residentName: users.name,
        startDate: allocations.startDate,
        endDate: allocations.endDate,
      })
      .from(allocations)
      .innerJoin(beds, eq(beds.id, allocations.bedId))
      .innerJoin(users, eq(users.id, allocations.residentId))
      .where(isNull(allocations.endDate));

    return rows.map((r) => ({
      id: r.id,
      bedId: r.bedId,
      bedLabel: r.bedLabel,
      residentId: r.residentId,
      residentName: r.residentName,
      startDate: r.startDate.toISOString(),
      endDate: r.endDate ? r.endDate.toISOString() : null,
    }));
  }

  /**
   * Vacant beds offered for a resident, ranked by a heuristic match over the
   * room's preference tags (occupation / age band / native place). This is a
   * convenience ranker, not a constraint — vacancy is the only hard filter, so a
   * manager can always place anyone; preferences only reorder the list.
   */
  async suggestBeds(residentId: string): Promise<AvailableBed[]> {
    const db = this.ctx.db();

    const [resident] = await db
      .select()
      .from(users)
      .where(
        and(eq(users.id, residentId), eq(users.role, UserRole.RESIDENT)),
      );
    if (!resident) throw new NotFoundException("Resident not found");

    const vacant = await db
      .select({
        bedId: beds.id,
        bedLabel: beds.label,
        roomId: rooms.id,
        roomLabel: rooms.label,
        capacity: rooms.capacity,
        monthlyRentPaise: rooms.monthlyRentPaise,
        occupationPreference: rooms.occupationPreference,
        ageMin: rooms.ageMin,
        ageMax: rooms.ageMax,
        nativePlacePreference: rooms.nativePlacePreference,
      })
      .from(beds)
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .where(eq(beds.status, BedStatus.VACANT));

    const scored = vacant.map((v) => {
      let score = 0;
      const reasons: string[] = [];

      if (v.occupationPreference && resident.occupationType) {
        if (v.occupationPreference === resident.occupationType) {
          score += 3;
          reasons.push(`occupation: ${resident.occupationType}`);
        } else {
          score -= 2; // mismatched preference de-prioritizes, never excludes
        }
      }

      if (resident.age != null && (v.ageMin != null || v.ageMax != null)) {
        const okMin = v.ageMin == null || resident.age >= v.ageMin;
        const okMax = v.ageMax == null || resident.age <= v.ageMax;
        if (okMin && okMax) {
          score += 2;
          reasons.push("age band");
        } else {
          score -= 1;
        }
      }

      if (
        v.nativePlacePreference &&
        resident.nativePlace &&
        v.nativePlacePreference.trim().toLowerCase() ===
          resident.nativePlace.trim().toLowerCase()
      ) {
        score += 2;
        reasons.push(`native place: ${resident.nativePlace}`);
      }

      return {
        bedId: v.bedId,
        bedLabel: v.bedLabel,
        roomId: v.roomId,
        roomLabel: v.roomLabel,
        capacity: v.capacity,
        monthlyRentPaise: v.monthlyRentPaise,
        matchScore: score,
        matchReasons: reasons,
      };
    });

    // Best fit first; cheaper rent breaks ties.
    scored.sort(
      (a, b) =>
        b.matchScore - a.matchScore ||
        a.monthlyRentPaise - b.monthlyRentPaise,
    );
    return scored;
  }

  /**
   * Occupied beds whose sitting resident has a pending move-out request — the
   * "soon to free" targets a manager can pre-book a transfer onto. The transfer
   * auto-executes once that resident exits (daily job). All under tenant RLS.
   */
  async listExitingBeds(): Promise<ExitingBed[]> {
    const rows = await this.ctx
      .db()
      .select({
        bedId: beds.id,
        bedLabel: beds.label,
        roomId: rooms.id,
        roomLabel: rooms.label,
        capacity: rooms.capacity,
        occupationPreference: rooms.occupationPreference,
        monthlyRentPaise: rooms.monthlyRentPaise,
        occupantName: users.name,
        exitRequestedDate: users.exitRequestedDate,
      })
      .from(allocations)
      .innerJoin(users, eq(users.id, allocations.residentId))
      .innerJoin(beds, eq(beds.id, allocations.bedId))
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .where(
        and(isNull(allocations.endDate), isNotNull(users.exitRequestedAt)),
      );
    return rows.map((r) => ({
      bedId: r.bedId,
      bedLabel: r.bedLabel,
      roomId: r.roomId,
      roomLabel: r.roomLabel,
      capacity: r.capacity,
      occupationPreference: r.occupationPreference as OccupationType | null,
      monthlyRentPaise: r.monthlyRentPaise,
      occupantName: r.occupantName,
      exitRequestedDate: r.exitRequestedDate,
    }));
  }

  /**
   * Beds a manager may assign to one resident from their profile — the unified
   * placement list that the bed-assign dialog renders. The set depends on the
   * resident:
   *  - Long-term: VACANT beds now, plus OCCUPIED beds whose sitting resident has
   *    requested a move-out on/before this resident's planned move-in (a future
   *    booking target). A future move-in onto a "leaving soon" bed becomes a
   *    booking; a today/past move-in onto a vacant bed becomes a live allocation.
   *  - Short stay: VACANT beds, plus beds RESERVED for a future booking whose
   *    move-in is strictly after this guest's check-out (so the guest vacates
   *    before the incoming resident arrives — the short-stay invariant).
   */
  async listEligibleBeds(residentId: string): Promise<EligibleBed[]> {
    const db = this.ctx.db();
    const [resident] = await db
      .select({
        isShortStay: users.isShortStay,
        expectedMoveInDate: users.expectedMoveInDate,
        shortStayCheckOutDate: users.shortStayCheckOutDate,
      })
      .from(users)
      .where(and(eq(users.id, residentId), eq(users.role, UserRole.RESIDENT)));
    if (!resident) throw new NotFoundException("Resident not found");

    const vacant = await db
      .select({
        bedId: beds.id,
        bedLabel: beds.label,
        roomId: rooms.id,
        roomLabel: rooms.label,
        capacity: rooms.capacity,
        occupationPreference: rooms.occupationPreference,
        monthlyRentPaise: rooms.monthlyRentPaise,
      })
      .from(beds)
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .where(eq(beds.status, BedStatus.VACANT));

    // The vacant query enumerates every VACANT bed in the tenant, so a per-room
    // tally of those rows is exactly each room's remaining-bed count.
    const vacantByRoom = new Map<string, number>();
    for (const v of vacant)
      vacantByRoom.set(v.roomId, (vacantByRoom.get(v.roomId) ?? 0) + 1);

    const result: EligibleBed[] = vacant.map((v) => ({
      bedId: v.bedId,
      bedLabel: v.bedLabel,
      roomLabel: v.roomLabel,
      capacity: v.capacity,
      occupationPreference: v.occupationPreference as OccupationType | null,
      bedsRemaining: vacantByRoom.get(v.roomId) ?? 0,
      monthlyRentPaise: v.monthlyRentPaise,
      kind: "VACANT",
      freesOnDate: null,
      occupantName: null,
    }));

    if (resident.isShortStay) {
      // RESERVED beds whose pending booking starts strictly after this guest's
      // check-out — the guest can hold the bed in the interim.
      const checkOut = resident.shortStayCheckOutDate;
      const reserved = await db
        .select({
          bedId: beds.id,
          bedLabel: beds.label,
          roomId: rooms.id,
          roomLabel: rooms.label,
          capacity: rooms.capacity,
          occupationPreference: rooms.occupationPreference,
          monthlyRentPaise: rooms.monthlyRentPaise,
          moveInDate: bookings.moveInDate,
          occupantName: users.name,
        })
        .from(beds)
        .innerJoin(rooms, eq(rooms.id, beds.roomId))
        .innerJoin(
          bookings,
          and(
            eq(bookings.bedId, beds.id),
            eq(bookings.status, BookingStatus.PENDING),
          ),
        )
        .innerJoin(users, eq(users.id, bookings.residentId))
        .where(eq(beds.status, BedStatus.RESERVED));
      // Prefer reserved-free-after beds for short stays: their capacity would
      // otherwise sit idle until the incoming resident's move-in, so filling
      // them first keeps truly-vacant beds open for long-term placements. Emit
      // reserved beds ahead of the vacant ones already in `result`.
      const reservedBeds: EligibleBed[] = [];
      for (const r of reserved) {
        const moveInStr = istDateString(r.moveInDate);
        if (checkOut && moveInStr <= checkOut) continue; // guest must leave first
        reservedBeds.push({
          bedId: r.bedId,
          bedLabel: r.bedLabel,
          roomLabel: r.roomLabel,
          capacity: r.capacity,
          occupationPreference: r.occupationPreference as OccupationType | null,
          bedsRemaining: vacantByRoom.get(r.roomId) ?? 0,
          monthlyRentPaise: r.monthlyRentPaise,
          kind: "RESERVED_FREE_AFTER",
          freesOnDate: moveInStr,
          occupantName: r.occupantName,
        });
      }
      result.unshift(...reservedBeds);
    } else {
      // OCCUPIED beds whose resident is leaving on/before the planned move-in
      // (an unspecified exit date is included — the manager decides).
      const moveIn = resident.expectedMoveInDate;
      const exiting = await this.listExitingBeds();
      for (const e of exiting) {
        if (moveIn && e.exitRequestedDate && e.exitRequestedDate > moveIn)
          continue;
        result.push({
          bedId: e.bedId,
          bedLabel: e.bedLabel,
          roomLabel: e.roomLabel,
          capacity: e.capacity,
          occupationPreference: e.occupationPreference,
          bedsRemaining: vacantByRoom.get(e.roomId) ?? 0,
          monthlyRentPaise: e.monthlyRentPaise,
          kind: "LEAVING_SOON",
          freesOnDate: e.exitRequestedDate,
          occupantName: e.occupantName,
        });
      }
    }

    return result;
  }

  // ---- Room transfers (pre-booked move with mid-month prorated billing) ----

  /**
   * Manager pre-books a move: record a PENDING request to move a resident to a
   * target bed by a planned date. Soft hold — the bed is NOT locked; vacancy is
   * re-checked when the move executes. The resident must currently be allocated
   * (that's the "from" bed). At most one PENDING request per resident.
   */
  async createTransferRequest(
    input: CreateTransferRequestInput,
  ): Promise<{ id: string }> {
    const tenantId = this.ctx.currentTenantId()!;
    const db = this.ctx.db();

    const [active] = await db
      .select({ bedId: allocations.bedId })
      .from(allocations)
      .where(
        and(
          eq(allocations.residentId, input.residentId),
          isNull(allocations.endDate),
        ),
      );
    if (!active)
      throw new NotFoundException(
        "Resident has no active allocation to transfer from",
      );
    if (active.bedId === input.toBedId)
      throw new ConflictException("Resident is already in that bed");

    // Early feedback for the same invariant enforced at execution.
    await assertNoUnsettledAdjustment(db, input.residentId);

    const [toBed] = await db
      .select({ id: beds.id })
      .from(beds)
      .where(eq(beds.id, input.toBedId));
    if (!toBed) throw new NotFoundException("Target bed not found");

    try {
      const [row] = await db
        .insert(transferRequests)
        .values({
          tenantId,
          residentId: input.residentId,
          fromBedId: active.bedId,
          toBedId: input.toBedId,
          plannedDate: new Date(input.plannedDate),
          status: TransferRequestStatus.PENDING,
        })
        .returning({ id: transferRequests.id });
      return { id: row.id };
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException(
          "Resident already has a pending transfer request",
        );
      throw err;
    }
  }

  /** Manager: transfer requests (newest first) with resident + bed labels. */
  async listTransferRequests(): Promise<TransferRequestSummary[]> {
    const fromBed = alias(beds, "from_bed");
    const toBed = alias(beds, "to_bed");
    const rows = await this.ctx
      .db()
      .select({
        id: transferRequests.id,
        residentId: transferRequests.residentId,
        residentName: users.name,
        fromBedId: transferRequests.fromBedId,
        fromBedLabel: fromBed.label,
        toBedId: transferRequests.toBedId,
        toBedLabel: toBed.label,
        plannedDate: transferRequests.plannedDate,
        status: transferRequests.status,
        createdAt: transferRequests.createdAt,
        completedAt: transferRequests.completedAt,
      })
      .from(transferRequests)
      .innerJoin(users, eq(users.id, transferRequests.residentId))
      .innerJoin(fromBed, eq(fromBed.id, transferRequests.fromBedId))
      .innerJoin(toBed, eq(toBed.id, transferRequests.toBedId))
      .orderBy(desc(transferRequests.createdAt));

    return rows.map((r) => ({
      id: r.id,
      residentId: r.residentId,
      residentName: r.residentName,
      fromBedId: r.fromBedId,
      fromBedLabel: r.fromBedLabel,
      toBedId: r.toBedId,
      toBedLabel: r.toBedLabel,
      plannedDate: r.plannedDate.toISOString(),
      status: r.status as TransferRequestStatus,
      createdAt: r.createdAt.toISOString(),
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    }));
  }

  /** Manager: drop a PENDING request (conditional flip — concurrency-safe). */
  async cancelTransferRequest(id: string): Promise<{ cancelled: boolean }> {
    const cancelled = await this.ctx
      .db()
      .update(transferRequests)
      .set({ status: TransferRequestStatus.CANCELLED })
      .where(
        and(
          eq(transferRequests.id, id),
          eq(transferRequests.status, TransferRequestStatus.PENDING),
        ),
      )
      .returning({ id: transferRequests.id });
    if (cancelled.length !== 1) {
      const [exists] = await this.ctx
        .db()
        .select({ status: transferRequests.status })
        .from(transferRequests)
        .where(eq(transferRequests.id, id));
      if (!exists) throw new NotFoundException("Transfer request not found");
      throw new ConflictException(
        `Transfer request already ${exists.status.toLowerCase()}`,
      );
    }
    return { cancelled: true };
  }

  /**
   * Manager: execute a PENDING request on the actual move day. Flips the request
   * to COMPLETED (conditional, concurrency-safe) and performs the move in the
   * same transaction, so a failed move (e.g. target bed taken) rolls the
   * completion back too. `moveDate` defaults to now.
   */
  async executeTransferRequest(
    id: string,
    moveDateInput?: string,
  ): Promise<{ id: string }> {
    const db = this.ctx.db();
    const moveDate = moveDateInput ? new Date(moveDateInput) : new Date();
    try {
      return await db.transaction(async (tx) => {
        const [req] = await tx
          .update(transferRequests)
          .set({
            status: TransferRequestStatus.COMPLETED,
            completedAt: new Date(),
          })
          .where(
            and(
              eq(transferRequests.id, id),
              eq(transferRequests.status, TransferRequestStatus.PENDING),
            ),
          )
          .returning({
            residentId: transferRequests.residentId,
            toBedId: transferRequests.toBedId,
          });
        if (!req) {
          const [exists] = await tx
            .select({ status: transferRequests.status })
            .from(transferRequests)
            .where(eq(transferRequests.id, id));
          if (!exists)
            throw new NotFoundException("Transfer request not found");
          throw new ConflictException(
            `Transfer request already ${exists.status.toLowerCase()}`,
          );
        }
        return this.doTransfer(tx, {
          residentId: req.residentId,
          toBedId: req.toBedId,
          moveDate,
        });
      });
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException("Target bed already has an allocation");
      throw err;
    }
  }

  /**
   * Activate every due PENDING transfer whose planned IST day has arrived by
   * executing the move — but only once the target bed is actually free. A target
   * still OCCUPIED by a not-yet-exited resident (or an unsettled adjustment, or a
   * raced move) is skipped and retried on the next run; `executeTransferRequest`
   * is concurrency-safe (conditional flip + the allocation unique indexes), and a
   * failed move rolls its own request back to PENDING. Soft hold: the bed is NOT
   * reserved in advance, so for up to a day after the sitting resident exits the
   * freed bed could be taken by someone else first. Called per-tenant by the
   * daily job inside the tenant's RLS context. Returns the count moved.
   */
  async activateDueTransfers(): Promise<number> {
    const today = istStartOfDayUtc(new Date()).getTime();
    const pending = await this.ctx
      .db()
      .select({
        id: transferRequests.id,
        plannedDate: transferRequests.plannedDate,
      })
      .from(transferRequests)
      .where(eq(transferRequests.status, TransferRequestStatus.PENDING));

    let moved = 0;
    for (const t of pending) {
      if (istStartOfDayUtc(t.plannedDate).getTime() > today) continue; // not yet
      try {
        await this.executeTransferRequest(t.id);
        moved++;
      } catch {
        // Target not free yet, an unsettled adjustment, or a raced move — leave
        // the request PENDING and retry on the next run.
        this.logger.debug(`Transfer ${t.id} not ready to activate; will retry`);
      }
    }
    return moved;
  }

  /**
   * The move, inside a caller-supplied transaction. End the resident's active
   * allocation at `moveDate`, open a new one on `toBedId` from `moveDate`, flip
   * bed statuses, then settle the transfer month: leave its invoice untouched
   * and queue `delta = (old-room days + new-room days) − what that month was/will
   * be billed` as a signed `rent_adjustments` row (credit if negative). The
   * partial-unique indexes on `allocations` are the real double-booking guard —
   * a raced target allocation surfaces as a unique violation the callers map to
   * 409.
   */
  private async doTransfer(
    tx: Tx,
    input: { residentId: string; toBedId: string; moveDate: Date },
  ): Promise<{ id: string }> {
    const tenantId = this.ctx.currentTenantId()!;
    const { residentId, toBedId, moveDate } = input;

    const [active] = await tx
      .select({
        id: allocations.id,
        bedId: allocations.bedId,
        startDate: allocations.startDate,
      })
      .from(allocations)
      .where(
        and(eq(allocations.residentId, residentId), isNull(allocations.endDate)),
      );
    if (!active)
      throw new NotFoundException("No active allocation for this resident");
    if (active.bedId === toBedId)
      throw new ConflictException("Resident is already in that bed");

    // One unsettled transfer at a time: the delta math nets against the
    // transfer-month invoice, so a second move before that delta is consumed by
    // the next invoice would compound incorrectly. Block until it settles.
    await assertNoUnsettledAdjustment(tx, residentId);

    const [oldRoom] = await tx
      .select({ rent: rooms.monthlyRentPaise })
      .from(beds)
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .where(eq(beds.id, active.bedId));

    const [toBed] = await tx
      .select({ status: beds.status, rent: rooms.monthlyRentPaise })
      .from(beds)
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .where(eq(beds.id, toBedId));
    if (!toBed) throw new NotFoundException("Target bed not found");
    if (toBed.status !== BedStatus.VACANT)
      throw new ConflictException("Target bed is not vacant");

    // End old, start new, flip both beds.
    await tx
      .update(allocations)
      .set({ endDate: moveDate })
      .where(eq(allocations.id, active.id));
    const [newAlloc] = await tx
      .insert(allocations)
      .values({ tenantId, bedId: toBedId, residentId, startDate: moveDate })
      .returning({ id: allocations.id });
    // Release the old bed (→ RESERVED if a booking waits on it, else VACANT).
    await freeBed(tx, active.bedId);
    await tx
      .update(beds)
      .set({ status: BedStatus.OCCUPIED })
      .where(eq(beds.id, toBedId));

    // Settle the transfer month as a signed adjustment on the next invoice.
    const period = istPeriod(moveDate);
    const oldPortion = prorateSegment(
      oldRoom.rent,
      active.startDate,
      moveDate, // exclusive — resident vacates the old room on the move day
      period,
    );
    const newPortion = prorateSegment(toBed.rent, moveDate, null, period);
    const correctTotal = oldPortion + newPortion;

    const [existingInvoice] = await tx
      .select({ amountPaise: invoices.amountPaise })
      .from(invoices)
      .where(
        and(
          eq(invoices.residentId, residentId),
          eq(invoices.period, period),
          isNull(invoices.deletedAt), // a voided invoice is not a billed baseline
        ),
      );
    // If the transfer month already has a LIVE invoice (billed full old-room on
    // the 1st, possibly PAID), we can't change it — queue the delta to reconcile
    // it on the next invoice. If there's no live invoice yet (not generated, or
    // voided to be re-generated), generation is segment-aware and will price the
    // whole month (old room + new room) itself, so no adjustment is needed.
    const delta = existingInvoice
      ? correctTotal - existingInvoice.amountPaise
      : 0;

    if (delta !== 0) {
      await tx.insert(rentAdjustments).values({
        tenantId,
        residentId,
        amountPaise: delta,
        description: `Room transfer mid-${period} (prorated split)`,
        source: "TRANSFER",
        period,
      });
    }

    return { id: newAlloc.id };
  }
}

/** A stored instant's IST calendar date as a 'YYYY-MM-DD' string. */
function istDateString(d: Date): string {
  const { year, month, day } = istParts(d);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Guard: a resident may have at most one in-flight (unapplied) rent adjustment.
 * Each room transfer queues a signed delta that the next invoice consumes; a
 * second transfer before that happens would net against a stale baseline and
 * mis-bill, so refuse it until the pending one settles.
 */
async function assertNoUnsettledAdjustment(
  db: Tx | ReturnType<TenantContextService["db"]>,
  residentId: string,
): Promise<void> {
  const [pending] = await db
    .select({ id: rentAdjustments.id })
    .from(rentAdjustments)
    .where(
      and(
        eq(rentAdjustments.residentId, residentId),
        isNull(rentAdjustments.appliedToInvoiceId),
      ),
    )
    .limit(1);
  if (pending)
    throw new ConflictException(
      "This resident has an unsettled room-transfer adjustment; generate their next invoice before transferring again",
    );
}
