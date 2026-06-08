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
import { users } from "./users";

/**
 * A resident's security deposit. One per resident (`unique(resident_id)`).
 * `amount_paise` is the amount held; lifecycle HELD -> SETTLED on exit. The exit
 * ledger lives in `deposit_transactions`; `unique(id, tenant_id)` is that table's
 * composite-FK target.
 */
export const deposits = pgTable(
  "deposits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    residentId: uuid("resident_id").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    status: text("status").notNull().default("HELD"), // DepositStatus
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    residentFk: foreignKey({
      columns: [t.residentId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "deposits_resident_id_tenant_id_fk",
    }).onDelete("cascade"),
    idTenant: unique("deposits_id_tenant_id_unique").on(t.id, t.tenantId),
    onePerResident: unique("deposits_resident_id_unique").on(t.residentId),
  }),
);

export type Deposit = typeof deposits.$inferSelect;
export type NewDeposit = typeof deposits.$inferInsert;
