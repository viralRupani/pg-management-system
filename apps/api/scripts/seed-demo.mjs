#!/usr/bin/env node
/**
 * Demo seed for the admin dashboard. Onboards one PG + manager, builds a small
 * property, registers residents, allocates beds, generates invoices, then logs
 * in one resident to submit a payment and file a complaint — so every dashboard
 * card and panel has real data.
 *
 * Super-admin has no login endpoint, so we mint a PLATFORM_ADMIN token directly
 * with JWT_ACCESS_SECRET (same trick as the e2e harness). Reads the dev OTP
 * straight from Redis via redis-cli (the API only returns { sent: true }).
 *
 * Requires: infra up + migrated, and the API running on $API (default :4000).
 * Idempotent-ish: a fixed slug means re-runs hit a 409 on onboard and stop
 * (the PG already exists). Drop the tenant first to re-seed from scratch.
 *
 *   node apps/api/scripts/seed-demo.mjs
 */
import { createHmac, randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API = process.env.API ?? "http://localhost:4000";
const REDIS_CONTAINER = process.env.REDIS_CONTAINER ?? "pg_mgmt_redis";

// --- env ---------------------------------------------------------------------
function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync(resolve(__dirname, "../.env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* fall through to defaults */
  }
  return env;
}
const env = loadEnv();
const ACCESS_SECRET = env.JWT_ACCESS_SECRET ?? "dev-access-secret-change-me";

// --- jwt (HS256) -------------------------------------------------------------
const b64 = (obj) =>
  Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

function platformToken() {
  const header = b64({ alg: "HS256", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const payload = b64({
    sub: randomUUID(),
    tenantId: null,
    role: "PLATFORM_ADMIN",
    iat: now,
    exp: now + 3600,
  });
  const sig = createHmac("sha256", ACCESS_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${header}.${payload}.${sig}`;
}

// --- http --------------------------------------------------------------------
async function call(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  return { status: res.status, data };
}

function must(res, label) {
  if (res.status >= 300) {
    throw new Error(`${label} failed: ${res.status} ${JSON.stringify(res.data)}`);
  }
  return res.data;
}

function readOtp(tenantId, phone) {
  const key = `otp:${tenantId}:${phone}`;
  const out = execSync(
    `docker exec ${REDIS_CONTAINER} redis-cli GET "${key}"`,
  ).toString().trim();
  if (!out) throw new Error(`no OTP in redis for ${key}`);
  return out;
}

// --- seed --------------------------------------------------------------------
const SLUG = "sunrise-pg";
const MANAGER_EMAIL = "manager@sunrise.pg";
const PASSWORD = "password123";
const PERIOD = new Date().toISOString().slice(0, 7); // YYYY-MM

const RESIDENTS = [
  { name: "Aarav Sharma", phone: "+919800000101", occupationType: "PROFESSIONAL", nativePlace: "Jaipur", age: 26 },
  { name: "Vivaan Patel", phone: "+919800000102", occupationType: "STUDENT", nativePlace: "Surat", age: 21 },
  { name: "Diya Mehta", phone: "+919800000103", occupationType: "PROFESSIONAL", nativePlace: "Mumbai", age: 28 },
  { name: "Kabir Singh", phone: "+919800000104", occupationType: "STUDENT", nativePlace: "Delhi", age: 22 },
  { name: "Ananya Rao", phone: "+919800000105", occupationType: "OTHER", nativePlace: "Pune", age: 24 },
];

async function main() {
  const pt = platformToken();

  // 1. Onboard the PG (fixed slug → 409 on re-run).
  const onboard = await call("post", "/platform/tenants", pt, {
    name: "Sunrise PG",
    slug: SLUG,
    accentColor: "#0d9488", // teal — visibly different from the default indigo
    manager: { name: "Riya Shah", email: MANAGER_EMAIL, password: PASSWORD, phone: "+919800000001" },
  });
  if (onboard.status === 409) {
    console.log(`PG "${SLUG}" already exists — skipping seed.`);
    printCreds();
    return;
  }
  const tenantId = must(onboard, "onboard").id;
  console.log(`✓ Onboarded ${SLUG} (tenant ${tenantId})`);

  // 2. Manager login.
  const mgr = must(
    await call("post", "/auth/manager/login", null, { email: MANAGER_EMAIL, password: PASSWORD }),
    "manager login",
  ).accessToken;

  // 3. Property: building → floor → room → beds.
  const building = must(await call("post", "/property/buildings", mgr, { name: "Sunrise Block A", address: "Bopal, Ahmedabad" }), "building");
  const floor = must(await call("post", "/property/floors", mgr, { buildingId: building.id, label: "Ground Floor", floorNumber: 0 }), "floor");
  const room = must(await call("post", "/property/rooms", mgr, { floorId: floor.id, label: "G-101", capacity: 4, sharingType: "4-sharing", monthlyRentPaise: 800000 }), "room");
  const beds = [];
  for (const label of ["A", "B", "C", "D"]) {
    beds.push(must(await call("post", "/property/beds", mgr, { roomId: room.id, label: `G-101-${label}` }), `bed ${label}`));
  }
  console.log(`✓ Property: 1 room, ${beds.length} beds @ ₹8,000/mo`);

  // 4. Residents.
  const residents = [];
  for (const r of RESIDENTS) {
    residents.push(must(await call("post", "/residents", mgr, r), `resident ${r.name}`));
  }
  console.log(`✓ Registered ${residents.length} residents`);

  // 5. Allocate the first 4 residents (one stays unassigned).
  for (let i = 0; i < beds.length; i++) {
    must(await call("post", "/allocations", mgr, { bedId: beds[i].id, residentId: residents[i].id }), `allocate ${i}`);
  }
  console.log(`✓ Allocated 4 residents to beds`);

  // 6. Generate this month's invoices.
  must(await call("post", "/invoices/generate", mgr, { period: PERIOD }), "generate invoices");
  console.log(`✓ Generated invoices for ${PERIOD}`);

  // 7. Resident #1 logs in, submits a payment.
  const r1 = RESIDENTS[0];
  must(await call("post", "/auth/resident/otp/request", null, { pgCode: SLUG, phone: r1.phone }), "otp request");
  const code = readOtp(tenantId, r1.phone);
  const r1tok = must(await call("post", "/auth/resident/otp/verify", null, { pgCode: SLUG, phone: r1.phone, code }), "otp verify").accessToken;
  const myInvoices = must(await call("get", "/invoices/mine", r1tok), "my invoices");
  const inv = myInvoices[0];
  const up = must(await call("post", "/payments/upload-url", r1tok, { invoiceId: inv.id }), "upload-url");
  must(await call("post", "/payments", r1tok, { invoiceId: inv.id, screenshotKey: up.key }), "submit payment");
  console.log(`✓ Resident "${r1.name}" submitted a payment (pending review)`);

  // 8. A couple of complaints.
  must(await call("post", "/complaints", r1tok, { category: "WIFI", description: "Wi-Fi keeps dropping in the evening." }), "complaint 1");
  const r2 = RESIDENTS[1];
  must(await call("post", "/auth/resident/otp/request", null, { pgCode: SLUG, phone: r2.phone }), "otp2 request");
  const code2 = readOtp(tenantId, r2.phone);
  const r2tok = must(await call("post", "/auth/resident/otp/verify", null, { pgCode: SLUG, phone: r2.phone, code: code2 }), "otp2 verify").accessToken;
  must(await call("post", "/complaints", r2tok, { category: "MAINTENANCE", description: "Bathroom tap is leaking." }), "complaint 2");
  console.log(`✓ Filed 2 complaints`);

  printCreds();
}

function printCreds() {
  console.log("\n────────────────────────────────────────");
  console.log("Admin login:");
  console.log(`  URL:      http://localhost:3000/login`);
  console.log(`  Email:    ${MANAGER_EMAIL}`);
  console.log(`  Password: ${PASSWORD}`);
  console.log("────────────────────────────────────────\n");
}

main().catch((e) => {
  console.error("✗ Seed failed:", e.message);
  process.exit(1);
});
