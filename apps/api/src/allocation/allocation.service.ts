import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import {
  type AllocateBedInput,
  type AllocationSummary,
  type AvailableBed,
  BedStatus,
  UserRole,
} from "@pg/shared";
import { TenantContextService } from "../db/tenant-context";
import { allocations, beds, rooms, users } from "../db/schema";

/** Postgres unique_violation — raised by the active-allocation partial indexes. */
const PG_UNIQUE_VIOLATION = "23505";

/**
 * Bed allocation. `allocations` (active row = end_date IS NULL) is the source of
 * truth; `beds.status` is a convenience mirror mutated in the same transaction.
 * The two partial-unique indexes are the hard backstop against double-booking,
 * so even a concurrent racing allocate cannot place two residents on one bed.
 */
@Injectable()
export class AllocationService {
  constructor(private readonly ctx: TenantContextService) {}

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

    try {
      return await db.transaction(async (tx) => {
        const [alloc] = await tx
          .insert(allocations)
          .values({
            tenantId,
            bedId: input.bedId,
            residentId: input.residentId,
            startDate: input.startDate ? new Date(input.startDate) : new Date(),
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
      await tx
        .update(beds)
        .set({ status: BedStatus.VACANT })
        .where(eq(beds.id, active.bedId));

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
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === PG_UNIQUE_VIOLATION
  );
}
