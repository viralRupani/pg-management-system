import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, ne, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  type BedStatus,
  type BedSummary,
  type BuildingSummary,
  type CreateBedInput,
  type CreateBuildingInput,
  type CreateFloorInput,
  type CreateRoomInput,
  type FloorSummary,
  type OccupationType,
  type RoomSummary,
  BookingStatus,
} from "@pg/shared";
import { TenantContextService } from "../db/tenant-context";
import {
  allocations,
  beds,
  bookings,
  buildings,
  floors,
  rooms,
  users,
} from "../db/schema";

// A bed's occupant comes from either its active allocation OR its PENDING
// booking — two different `users` rows, so each needs its own alias.
const occUser = alias(users, "occ_user");
const bookUser = alias(users, "book_user");

/**
 * CRUD over the property hierarchy (buildings -> floors -> rooms -> beds), all
 * under tenant RLS. Every insert sets tenant_id from context — never the body.
 * Parent existence is checked under RLS first (so callers get a clean 404
 * instead of an opaque composite-FK error); the composite FK is the hard
 * security backstop that keeps a child inside its tenant.
 */
@Injectable()
export class PropertyService {
  constructor(private readonly ctx: TenantContextService) {}

  // --- Buildings ---
  async createBuilding(input: CreateBuildingInput): Promise<{ id: string }> {
    const [row] = await this.ctx
      .db()
      .insert(buildings)
      .values({
        tenantId: this.ctx.currentTenantId()!,
        name: input.name,
        address: input.address ?? null,
      })
      .returning();
    return { id: row.id };
  }

  async listBuildings(): Promise<BuildingSummary[]> {
    const rows = await this.ctx.db().select().from(buildings);
    return rows.map((b) => ({ id: b.id, name: b.name, address: b.address }));
  }

  // --- Floors ---
  async createFloor(input: CreateFloorInput): Promise<{ id: string }> {
    await this.assertExists(buildings, input.buildingId, "Building");
    const [row] = await this.ctx
      .db()
      .insert(floors)
      .values({
        tenantId: this.ctx.currentTenantId()!,
        buildingId: input.buildingId,
        label: input.label,
        floorNumber: input.floorNumber,
      })
      .returning();
    return { id: row.id };
  }

  async listFloors(buildingId?: string): Promise<FloorSummary[]> {
    const db = this.ctx.db();
    const rows = buildingId
      ? await db.select().from(floors).where(eq(floors.buildingId, buildingId))
      : await db.select().from(floors);
    return rows.map((f) => ({
      id: f.id,
      buildingId: f.buildingId,
      label: f.label,
      floorNumber: f.floorNumber,
    }));
  }

  // --- Rooms ---
  async createRoom(input: CreateRoomInput): Promise<{ id: string }> {
    await this.assertExists(floors, input.floorId, "Floor");
    const [row] = await this.ctx
      .db()
      .insert(rooms)
      .values({
        tenantId: this.ctx.currentTenantId()!,
        floorId: input.floorId,
        label: input.label,
        capacity: input.capacity,
        monthlyRentPaise: input.monthlyRentPaise,
        occupationPreference: input.occupationPreference ?? null,
        genderPreference: input.genderPreference ?? null,
        ageMin: input.ageMin ?? null,
        ageMax: input.ageMax ?? null,
        nativePlacePreference: input.nativePlacePreference ?? null,
      })
      .returning();
    return { id: row.id };
  }

  async listRooms(floorId?: string): Promise<RoomSummary[]> {
    const db = this.ctx.db();
    const rows = floorId
      ? await db.select().from(rooms).where(eq(rooms.floorId, floorId))
      : await db.select().from(rooms);
    return rows.map((r) => ({
      id: r.id,
      floorId: r.floorId,
      label: r.label,
      capacity: r.capacity,
      monthlyRentPaise: r.monthlyRentPaise,
      occupationPreference: r.occupationPreference as OccupationType | null,
      genderPreference: r.genderPreference,
      ageMin: r.ageMin,
      ageMax: r.ageMax,
      nativePlacePreference: r.nativePlacePreference,
    }));
  }

  // --- Beds ---
  async createBed(input: CreateBedInput): Promise<{ id: string }> {
    await this.assertExists(rooms, input.roomId, "Room");
    const [row] = await this.ctx
      .db()
      .insert(beds)
      .values({
        tenantId: this.ctx.currentTenantId()!,
        roomId: input.roomId,
        label: input.label,
      })
      .returning();
    return { id: row.id };
  }

  async deleteBed(id: string): Promise<void> {
    const db = this.ctx.db();
    const [bed] = await db
      .select({ id: beds.id, status: beds.status })
      .from(beds)
      .where(eq(beds.id, id));
    if (!bed) throw new NotFoundException("Bed not found");
    if (bed.status !== "VACANT")
      throw new ConflictException(
        "Cannot delete an occupied or reserved bed. Move out the resident first.",
      );
    await db.delete(beds).where(eq(beds.id, id));
  }

  async deleteRoom(id: string): Promise<void> {
    const db = this.ctx.db();
    const [room] = await db
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.id, id));
    if (!room) throw new NotFoundException("Room not found");
    const [occupied] = await db
      .select({ id: beds.id })
      .from(beds)
      .where(and(eq(beds.roomId, id), ne(beds.status, "VACANT")))
      .limit(1);
    if (occupied)
      throw new ConflictException(
        "Cannot delete a room with occupied or reserved beds. Move out all residents first.",
      );
    await db.delete(rooms).where(eq(rooms.id, id));
  }

  async deleteBuilding(id: string): Promise<void> {
    const db = this.ctx.db();
    const [building] = await db
      .select({ id: buildings.id })
      .from(buildings)
      .where(eq(buildings.id, id));
    if (!building) throw new NotFoundException("Building not found");
    const [occupied] = await db
      .select({ id: beds.id })
      .from(beds)
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .innerJoin(floors, eq(floors.id, rooms.floorId))
      .where(and(eq(floors.buildingId, id), ne(beds.status, "VACANT")))
      .limit(1);
    if (occupied)
      throw new ConflictException(
        "Cannot delete a building with occupied or reserved beds. Move out all residents first.",
      );
    await db.delete(buildings).where(eq(buildings.id, id));
  }

  /** Rename a building. Pure relabel — no side effects, so a plain conditional
   * UPDATE (404 if not visible under the tenant) is enough. */
  async renameBuilding(id: string, name: string): Promise<{ id: string }> {
    const [row] = await this.ctx
      .db()
      .update(buildings)
      .set({ name })
      .where(eq(buildings.id, id))
      .returning({ id: buildings.id });
    if (!row) throw new NotFoundException("Building not found");
    return { id: row.id };
  }

  /** Rename a floor (relabel only). */
  async renameFloor(id: string, label: string): Promise<{ id: string }> {
    const [row] = await this.ctx
      .db()
      .update(floors)
      .set({ label })
      .where(eq(floors.id, id))
      .returning({ id: floors.id });
    if (!row) throw new NotFoundException("Floor not found");
    return { id: row.id };
  }

  /** Rename a room (relabel only; rent edits go through updateRoomRent). */
  async renameRoom(id: string, label: string): Promise<{ id: string }> {
    const [row] = await this.ctx
      .db()
      .update(rooms)
      .set({ label })
      .where(eq(rooms.id, id))
      .returning({ id: rooms.id });
    if (!row) throw new NotFoundException("Room not found");
    return { id: row.id };
  }

  /** Rename a bed (relabel only). */
  async renameBed(id: string, label: string): Promise<{ id: string }> {
    const [row] = await this.ctx
      .db()
      .update(beds)
      .set({ label })
      .where(eq(beds.id, id))
      .returning({ id: beds.id });
    if (!row) throw new NotFoundException("Bed not found");
    return { id: row.id };
  }

  /** Edit a room's monthly rent (paise). Feeds invoice generation. */
  async updateRoomRent(
    roomId: string,
    monthlyRentPaise: number,
  ): Promise<{ id: string }> {
    const [row] = await this.ctx
      .db()
      .update(rooms)
      .set({ monthlyRentPaise })
      .where(eq(rooms.id, roomId))
      .returning({ id: rooms.id });
    if (!row) throw new NotFoundException("Room not found");
    return { id: row.id };
  }

  async listBeds(roomId?: string): Promise<BedSummary[]> {
    const db = this.ctx.db();
    // Resolve each bed's occupant: the active allocation's resident (OCCUPIED),
    // else the holder of a PENDING booking (RESERVED). Both are ≤1-per-bed
    // (partial-unique active allocation + bookings_pending_bed_unique), so no
    // fan-out. Two aliased `users` joins since they're distinct people.
    const rows = await db
      .select({
        id: beds.id,
        roomId: beds.roomId,
        label: beds.label,
        status: beds.status,
        allocResidentId: allocations.residentId,
        allocName: occUser.name,
        bookResidentId: bookings.residentId,
        bookName: bookUser.name,
      })
      .from(beds)
      .leftJoin(
        allocations,
        and(eq(allocations.bedId, beds.id), isNull(allocations.endDate)),
      )
      .leftJoin(occUser, eq(occUser.id, allocations.residentId))
      .leftJoin(
        bookings,
        and(
          eq(bookings.bedId, beds.id),
          eq(bookings.status, BookingStatus.PENDING),
        ),
      )
      .leftJoin(bookUser, eq(bookUser.id, bookings.residentId))
      .where(roomId ? eq(beds.roomId, roomId) : undefined);
    return rows.map((b) => ({
      id: b.id,
      roomId: b.roomId,
      label: b.label,
      status: b.status as BedStatus,
      occupantResidentId: b.allocResidentId ?? b.bookResidentId ?? null,
      occupantName: b.allocName ?? b.bookName ?? null,
    }));
  }

  /**
   * Confirm a parent row is visible under the current tenant context. RLS scopes
   * the lookup, so a row owned by another tenant simply isn't found -> 404.
   */
  private async assertExists(
    table: typeof buildings | typeof floors | typeof rooms,
    id: string,
    label: string,
  ): Promise<void> {
    const [row] = await this.ctx
      .db()
      .select({ id: table.id })
      .from(table)
      .where(eq(table.id, id));
    if (!row) throw new NotFoundException(`${label} not found`);
  }
}
