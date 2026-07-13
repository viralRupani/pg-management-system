#!/usr/bin/env node
/**
 * Master seed — wipes all data and creates the PG owner only.
 *
 *   Owner:  viral-owner@yopmail.com  (viral-owner@yopmail)
 *
 * No PGs/managers/residents are created — the owner logs in and creates PGs
 * from the admin UI. Run `truncate.mjs` first if the DB already has data.
 *
 * Usage:  node apps/api/scripts/seed.mjs
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";

const require = createRequire(import.meta.url);
const { Pool } = require("pg");
const argon2 = require("argon2");

const DB_URL = "postgres://postgres:postgres@localhost:5433/pg_management";

const OWNER_NAME = "Viral Rupani";
const OWNER_EMAIL = "viral-owner@yopmail.com";
const OWNER_PASSWORD = "viral-owner@yopmail";

const pool = new Pool({ connectionString: DB_URL });

async function q(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function insertOne(table, row) {
  const cols = Object.keys(row);
  const vals = Object.values(row);
  const ph = cols.map((_, i) => `$${i + 1}`).join(", ");
  const [r] = await q(
    `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${ph}) RETURNING *`,
    vals,
  );
  return r;
}

async function main() {
  console.log("Hashing password…");
  const pwHash = await argon2.hash(OWNER_PASSWORD);

  console.log("Creating owner…");
  const ownerId = randomUUID();
  await insertOne("owners", {
    id: ownerId,
    name: OWNER_NAME,
    email: OWNER_EMAIL,
    created_at: new Date(),
  });
  await insertOne("auth_identities", {
    id: randomUUID(),
    tenant_id: null,
    role: "PG_OWNER",
    user_id: ownerId,
    email: OWNER_EMAIL,
    password_hash: pwHash,
    must_change_password: false,
    created_at: new Date(),
  });

  await pool.end();

  console.log("\n✅ Seed complete!\n");
  console.log("  ─────────────────────────────────────────────────────────");
  console.log(`  Owner:    ${OWNER_EMAIL}`);
  console.log(`  Password: ${OWNER_PASSWORD}`);
  console.log("  ─────────────────────────────────────────────────────────");
  console.log("  No PGs yet — create one from the admin login.");
}

main().catch((err) => {
  console.error("✗ Seed failed:", err.message);
  pool.end();
  process.exit(1);
});
