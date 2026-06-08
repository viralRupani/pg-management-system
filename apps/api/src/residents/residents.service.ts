import { Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import {
  type RegisterResidentInput,
  type ResidentSummary,
  ResidentStatus,
  UserRole,
} from "@pg/shared";
import { TenantContextService } from "../db/tenant-context";
import { allocations, authIdentities, beds, users } from "../db/schema";

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

    return db.transaction(async (tx) => {
      const [resident] = await tx
        .insert(users)
        .values({
          tenantId, // from context, not from input
          role: UserRole.RESIDENT,
          name: input.name,
          phone: input.phone,
          email: input.email ?? null,
          age: input.age ?? null,
          occupationType: input.occupationType,
          nativePlace: input.nativePlace ?? null,
          emergencyContact: input.emergencyContact ?? null,
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

  async list(): Promise<ResidentSummary[]> {
    const rows = await this.residentQuery().where(
      eq(users.role, UserRole.RESIDENT),
    );
    return rows.map(toSummary);
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
        occupationType: users.occupationType,
        nativePlace: users.nativePlace,
        status: users.status,
        bedLabel: beds.label,
      })
      .from(users)
      .leftJoin(
        allocations,
        and(
          eq(allocations.residentId, users.id),
          isNull(allocations.endDate),
        ),
      )
      .leftJoin(beds, eq(beds.id, allocations.bedId));
  }
}

type ResidentRow = {
  id: string;
  name: string;
  phone: string | null;
  occupationType: string | null;
  nativePlace: string | null;
  status: string;
  bedLabel: string | null;
};

function toSummary(r: ResidentRow): ResidentSummary {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone ?? "",
    occupationType: (r.occupationType ??
      "OTHER") as ResidentSummary["occupationType"],
    nativePlace: r.nativePlace,
    status: r.status as ResidentStatus,
    bedLabel: r.bedLabel,
  };
}
