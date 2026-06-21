import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  and,
  count,
  eq,
  exists,
  ilike,
  inArray,
  isNotNull,
  isNull,
  not,
  or,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  type RegisterResidentInput,
  type ResidentListQuery,
  type ResidentListResult,
  type ResidentSummary,
  BookingStatus,
  DocumentStatus,
  DocumentType,
  KycStatus,
  ResidentStatus,
  UserRole,
} from "@pg/shared";
import { TenantContextService } from "../db/tenant-context";
import {
  allocations,
  authIdentities,
  beds,
  bookings,
  buildings,
  documents,
  floors,
  rooms,
  users,
} from "../db/schema";

// A resident's held bed (PENDING booking) joins `beds` a SECOND time, so it
// needs its own alias to avoid colliding with the active-allocation bed join.
const bookedBeds = alias(beds, "booked_beds");

const PG_UNIQUE_VIOLATION = "23505";

// The document type that constitutes KYC today. Adding more required types
// later means rolling the per-resident status up across all of them; for one
// type the resident's KYC status is just that document's status.
const KYC_REQUIRED_DOC_TYPE = DocumentType.AADHAAR;

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
    const { q, status, kyc, exitRequested, page, limit } = query;
    const conditions = [eq(users.role, UserRole.RESIDENT)];
    if (exitRequested) conditions.push(isNotNull(users.exitRequestedAt));
    if (status === "CURRENT") {
      conditions.push(
        inArray(users.status, [ResidentStatus.ACTIVE, ResidentStatus.UPCOMING]),
      );
    } else if (status !== "ALL") {
      conditions.push(eq(users.status, status));
    }
    if (q) {
      const pattern = `%${q}%`;
      conditions.push(
        or(ilike(users.name, pattern), ilike(users.phone, pattern))!,
      );
    }
    // KYC filter as a correlated EXISTS (not a reference to the display
    // left-join below): the count query is `from(users)` with no join, so the
    // condition must stand on its own and is shared by both queries.
    if (kyc !== "ALL") {
      const verifiedKyc = exists(
        this.ctx
          .db()
          .select({ one: documents.id })
          .from(documents)
          .where(
            and(
              eq(documents.residentId, users.id),
              eq(documents.type, KYC_REQUIRED_DOC_TYPE),
              eq(documents.status, DocumentStatus.VERIFIED),
            ),
          ),
      );
      conditions.push(kyc === "VERIFIED" ? verifiedKyc : not(verifiedKyc));
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
        bedId: beds.id,
        roomCapacity: rooms.capacity,
        roomLabel: rooms.label,
        floorLabel: floors.label,
        buildingName: buildings.name,
        bookedBedLabel: bookedBeds.label,
        bookedBedId: bookedBeds.id,
        moveInDate: bookings.moveInDate,
        exitRequestedDate: users.exitRequestedDate,
        kycDocStatus: documents.status,
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
      .leftJoin(rooms, eq(rooms.id, beds.roomId))
      // 1:1 up the property tree (each bed has one room, floor, building) — no
      // fan-out, like the rooms join above. Surfaces the full location path.
      .leftJoin(floors, eq(floors.id, rooms.floorId))
      .leftJoin(buildings, eq(buildings.id, floors.buildingId))
      // The resident's held bed, if any: the (at most one) PENDING booking and
      // its bed. One-per-resident deposit makes this 1:1, so it can't fan out.
      .leftJoin(
        bookings,
        and(
          eq(bookings.residentId, users.id),
          eq(bookings.status, BookingStatus.PENDING),
        ),
      )
      .leftJoin(bookedBeds, eq(bookedBeds.id, bookings.bedId))
      // 1:1 — the unique (tenant, resident, type) index means at most one
      // Aadhaar row per resident, so this can't fan out the result set.
      .leftJoin(
        documents,
        and(
          eq(documents.residentId, users.id),
          eq(documents.type, KYC_REQUIRED_DOC_TYPE),
        ),
      );
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
  bedId: string | null;
  roomCapacity: number | null;
  roomLabel: string | null;
  floorLabel: string | null;
  buildingName: string | null;
  bookedBedLabel: string | null;
  bookedBedId: string | null;
  moveInDate: Date | null;
  exitRequestedDate: string | null;
  kycDocStatus: string | null;
};

// No required document on file → KYC not started; otherwise the resident's KYC
// status is the required document's own review state (values line up 1:1).
function toKycStatus(docStatus: string | null): KycStatus {
  switch (docStatus) {
    case DocumentStatus.VERIFIED:
      return KycStatus.VERIFIED;
    case DocumentStatus.REJECTED:
      return KycStatus.REJECTED;
    case DocumentStatus.PENDING:
      return KycStatus.PENDING;
    default:
      return KycStatus.NOT_SUBMITTED;
  }
}

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
    bedId: r.bedId,
    roomCapacity: r.roomCapacity ?? null,
    roomLabel: r.roomLabel,
    floorLabel: r.floorLabel,
    buildingName: r.buildingName,
    bookedBedLabel: r.bookedBedLabel,
    bookedBedId: r.bookedBedId,
    moveInDate: r.moveInDate ? r.moveInDate.toISOString() : null,
    exitRequestedDate: r.exitRequestedDate,
    kycStatus: toKycStatus(r.kycDocStatus),
  };
}
