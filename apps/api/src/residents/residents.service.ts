import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, count, eq, ilike, isNull, or } from "drizzle-orm";
import {
  type RegisterResidentInput,
  type ResidentListQuery,
  type ResidentListResult,
  type ResidentSummary,
  ResidentStatus,
  UserRole,
} from "@pg/shared";
import { TenantContextService } from "../db/tenant-context";
import { allocations, authIdentities, beds, rooms, users } from "../db/schema";

const PG_UNIQUE_VIOLATION = "23505";

/**
 * Resident operations, all under tenant RLS. The tenant id comes from the
 * authenticated context (TenantContextService), NEVER from the request body —
 * so a forged tenant_id in the payload is impossible to express, and RLS
 * WITH CHECK is the backstop if app code ever regresses.
 */
@Injectable()
export class ResidentsService {
  constructor(private readonly ctx: TenantContextService) {}

  async register(input: RegisterResidentInput): Promise<{ id: string }> {
    const tenantId = this.ctx.currentTenantId()!;
    const db = this.ctx.db();

    try {
      return await this.insertResident(db, tenantId, input);
    } catch (err) {
      // Phone is unique per tenant in auth_identities — surface a clean 409
      // instead of leaking the raw DB unique violation as a 500.
      if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        throw new ConflictException(
          "A resident with this phone number already exists in this PG",
        );
      }
      throw err;
    }
  }

  private insertResident(
    db: ReturnType<TenantContextService["db"]>,
    tenantId: string,
    input: RegisterResidentInput,
  ): Promise<{ id: string }> {
    return db.transaction(async (tx) => {
      const [resident] = await tx
        .insert(users)
        .values({
          tenantId, // from context, not from input
          role: UserRole.RESIDENT,
          name: input.name,
          phone: input.phone,
          email: input.email ?? null,
          age: input.age,
          occupationType: input.occupationType,
          nativePlace: input.nativePlace ?? null,
          emergencyContactName: input.emergencyContactName ?? null,
          emergencyContactRelation: input.emergencyContactRelation ?? null,
          emergencyContactPhone: input.emergencyContactPhone ?? null,
          status: ResidentStatus.ACTIVE,
          joinDate: input.joinDate ? new Date(input.joinDate) : new Date(),
        })
        .returning();

      await tx.insert(authIdentities).values({
        tenantId,
        role: UserRole.RESIDENT,
        userId: resident.id,
        phone: input.phone,
      });

      return { id: resident.id };
    });
  }

  /**
   * Search (name/phone, case-insensitive substring) + status filter ("ALL"
   * skips the filter) + offset pagination. Filtering happens in SQL — the
   * `WHERE` only touches `users` columns, so the count query needs no joins.
   */
  async list(query: ResidentListQuery): Promise<ResidentListResult> {
    const { q, status, page, limit } = query;
    const conditions = [eq(users.role, UserRole.RESIDENT)];
    if (status !== "ALL") conditions.push(eq(users.status, status));
    if (q) {
      const pattern = `%${q}%`;
      conditions.push(
        or(ilike(users.name, pattern), ilike(users.phone, pattern))!,
      );
    }
    const where = and(...conditions)!;

    const [rows, [{ total }]] = await Promise.all([
      this.residentQuery()
        .where(where)
        .limit(limit)
        .offset((page - 1) * limit),
      this.ctx.db().select({ total: count() }).from(users).where(where),
    ]);

    return { items: rows.map(toSummary), total, page, limit };
  }

  async getById(id: string): Promise<ResidentSummary> {
    const [r] = await this.residentQuery().where(
      and(eq(users.id, id), eq(users.role, UserRole.RESIDENT)),
    );
    if (!r) throw new NotFoundException("Resident not found");
    return toSummary(r);
  }

  /**
   * Base select that left-joins each resident's CURRENT bed (the active
   * allocation, end_date IS NULL) so the summary can show a bed label without
   * an N+1. All under tenant RLS.
   */
  private residentQuery() {
    return this.ctx
      .db()
      .select({
        id: users.id,
        name: users.name,
        phone: users.phone,
        age: users.age,
        occupationType: users.occupationType,
        nativePlace: users.nativePlace,
        emergencyContactName: users.emergencyContactName,
        emergencyContactRelation: users.emergencyContactRelation,
        emergencyContactPhone: users.emergencyContactPhone,
        status: users.status,
        bedLabel: beds.label,
        roomCapacity: rooms.capacity,
      })
      .from(users)
      .leftJoin(
        allocations,
        and(
          eq(allocations.residentId, users.id),
          isNull(allocations.endDate),
        ),
      )
      .leftJoin(beds, eq(beds.id, allocations.bedId))
      .leftJoin(rooms, eq(rooms.id, beds.roomId));
  }
}

type ResidentRow = {
  id: string;
  name: string;
  phone: string | null;
  age: number | null;
  occupationType: string | null;
  nativePlace: string | null;
  emergencyContactName: string | null;
  emergencyContactRelation: string | null;
  emergencyContactPhone: string | null;
  status: string;
  bedLabel: string | null;
  roomCapacity: number | null;
};

function toSummary(r: ResidentRow): ResidentSummary {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone ?? "",
    age: r.age,
    occupationType: (r.occupationType ??
      "OTHER") as ResidentSummary["occupationType"],
    nativePlace: r.nativePlace,
    emergencyContactName: r.emergencyContactName,
    emergencyContactRelation:
      r.emergencyContactRelation as ResidentSummary["emergencyContactRelation"],
    emergencyContactPhone: r.emergencyContactPhone,
    status: r.status as ResidentStatus,
    bedLabel: r.bedLabel,
    roomCapacity: r.roomCapacity ?? null,
  };
}
