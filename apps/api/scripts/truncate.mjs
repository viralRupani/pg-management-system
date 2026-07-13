#!/usr/bin/env node
/**
 * Wipe every row from every application table in the local dev DB, in one
 * TRUNCATE ... CASCADE (order-independent — cascade resolves FK dependencies).
 * Sequences are restarted for good measure even though every id is a UUID.
 *
 * Usage:  node apps/api/scripts/truncate.mjs
 */
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { Pool } = require("pg");

const DB_URL = "postgres://postgres:postgres@localhost:5433/pg_management";

// Global (no-RLS) tables + every RLS_TABLES entry (apps/api/src/db/schema/index.ts).
const TABLES = [
  "tenants",
  "owners",
  "owner_tenants",
  "auth_identities",
  "tc_versions",
  "tc_acceptances",
  "users",
  "buildings",
  "floors",
  "rooms",
  "beds",
  "allocations",
  "transfer_requests",
  "bookings",
  "invoices",
  "payments",
  "rent_adjustments",
  "extra_charges",
  "invoice_charges",
  "notifications",
  "push_tokens",
  "documents",
  "deposits",
  "deposit_transactions",
  "complaints",
  "complaint_updates",
  "menu_config",
  "menu_slots",
  "announcements",
  "announcement_recipients",
  "budgets",
  "expenses",
  "billing_snapshots",
  "short_stays",
  "invoice_schedules",
  "referrals",
];

const pool = new Pool({ connectionString: DB_URL });

async function main() {
  console.log(`Truncating ${TABLES.length} tables…`);
  await pool.query(
    `TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`,
  );
  await pool.end();
  console.log("✅ Database truncated.");
}

main().catch((err) => {
  console.error("✗ Truncate failed:", err.message);
  pool.end();
  process.exit(1);
});
