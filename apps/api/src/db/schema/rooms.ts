import {
  foreignKey,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { floors } from "./floors";

/**
 * A room within a floor. Carries the rent and the allocation-preference tags
 * used by attribute-based bed matching. Money is stored as integer paise
 * (monthly_rent_paise) — the project-wide convention for all money columns, so
 * no float ever touches currency. Composite FK to floors(id, tenant_id) keeps
 * the parent reference inside the tenant.
 */
export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    floorId: uuid("floor_id").notNull(),
    label: text("label").notNull(), // e.g. "101"
    capacity: integer("capacity").notNull().default(1),
    monthlyRentPaise: integer("monthly_rent_paise").notNull().default(0),

    // Allocation-preference tags (all optional; null = no preference / "any").
    occupationPreference: text("occupation_preference"), // OccupationType | null
    genderPreference: text("gender_preference"), // free text for now
    ageMin: integer("age_min"),
    ageMax: integer("age_max"),
    nativePlacePreference: text("native_place_preference"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    floorFk: foreignKey({
      columns: [t.floorId, t.tenantId],
      foreignColumns: [floors.id, floors.tenantId],
      name: "rooms_floor_id_tenant_id_fk",
    }).onDelete("cascade"),
    idTenant: unique("rooms_id_tenant_id_unique").on(t.id, t.tenantId),
  }),
);

export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;
