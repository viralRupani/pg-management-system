#!/usr/bin/env node
/**
 * Viral demo seed — truncates the ENTIRE database, then rebuilds it from
 * scratch with one of every login role:
 *
 *   1) superadmin  viral-superadmin@yopmail.com  (PLATFORM_ADMIN)
 *   2) pg-owner    viral-owner@yopmail.com       (PG_OWNER)
 *   3) pg-manager  viral-manager@yopmail.com     (PG_MANAGER of Bliss Homes)
 *   4) resident    viral-resident@yopmail.com    (RESIDENT of Bliss Homes)
 *
 * All four share the password `viral@009`. The resident logs in on mobile with
 * slug `bliss-homes` + phone + OTP — set OTP_DEV_FIXED_CODE=009009 in apps/api/.env
 * and RESTART the API, then any OTP is 009009.
 *
 * Bliss Homes is owned by the pg-owner and gets a full property: 1 building,
 * 5 floors × 10 rooms (6× 4-sharing, 3× 2-sharing, 1× 1-sharing) = 50 rooms /
 * 155 beds. 21 residents (viral-resident + 20 generic) are registered and each
 * allocated to a bed.
 *
 * The super-admin has no signup endpoint, so we insert its auth_identity row
 * directly (argon2 hash). Truncate + that insert run on MIGRATION_DATABASE_URL
 * (the postgres superuser). Everything else goes through the real HTTP API.
 *
 * Requires: infra up + migrated, and the API running on $API (default :4000)
 * AFTER the OTP_DEV_FIXED_CODE change + restart.
 *
 *   node apps/api/scripts/seed-viral.mjs
 */
import { createHmac, randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const argon2 = require("argon2");
const { Pool } = require("pg");

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
const MIGRATION_DB =
  env.MIGRATION_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5433/pg_management";

// --- jwt (HS256) — mint a PLATFORM_ADMIN token (no login endpoint) -----------
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
  return { status: res.status, data: text ? JSON.parse(text) : undefined };
}

function must(res, label) {
  if (res.status >= 300) {
    throw new Error(`${label} failed: ${res.status} ${JSON.stringify(res.data)}`);
  }
  return res.data;
}

// --- constants ---------------------------------------------------------------
const PASSWORD = "viral@009";
const SLUG = "bliss-homes";
const SUPERADMIN_EMAIL = "viral-superadmin@yopmail.com";
const OWNER_EMAIL = "viral-owner@yopmail.com";
const MANAGER_EMAIL = "viral-manager@yopmail.com";
const RESIDENT_EMAIL = "viral-resident@yopmail.com";
const RESIDENT_PHONE = "+919900000099";
const MANAGER_PHONE = "+919900000098";

// Per-floor room layout: 6 rooms 4-sharing, 3 rooms 2-sharing, 1 room single.
const ROOM_LAYOUT = [
  ...Array(6).fill({ capacity: 4, rentPaise: 600000 }), // ₹6,000
  ...Array(3).fill({ capacity: 2, rentPaise: 900000 }), // ₹9,000
  ...Array(1).fill({ capacity: 1, rentPaise: 1500000 }), // ₹15,000
];
const FLOORS = 5;
const BED_LETTERS = ["A", "B", "C", "D"];

// 20 generic residents (viral-resident is the 21st, registered first).
const OCCUPATIONS = ["PROFESSIONAL", "STUDENT", "OTHER"];
const NATIVE = ["Ahmedabad", "Surat", "Rajkot", "Vadodara", "Mumbai", "Pune", "Jaipur", "Delhi", "Indore", "Bhopal"];
const FIRST = ["Aarav", "Vivaan", "Diya", "Kabir", "Ananya", "Rohan", "Priya", "Arjun", "Sneha", "Karan", "Pooja", "Nikhil", "Riya", "Aditya", "Meera", "Siddharth", "Ishaan", "Tanvi", "Vikram", "Nisha"];
const LAST = ["Sharma", "Patel", "Mehta", "Singh", "Rao", "Gupta", "Verma", "Nair", "Joshi", "Malhotra", "Iyer", "Desai", "Kapoor", "Kumar", "Pillai", "Reddy", "Bhatt", "Saxena", "Yadav", "Pandey"];

function genericResidents() {
  const list = [];
  for (let i = 0; i < 20; i++) {
    const seq = String(i + 1).padStart(2, "0");
    list.push({
      name: `${FIRST[i]} ${LAST[i]}`,
      phone: `+9199000000${seq}`, // +919900000001 .. +919900000020
      occupationType: OCCUPATIONS[i % OCCUPATIONS.length],
      nativePlace: NATIVE[i % NATIVE.length],
      age: 19 + (i % 18),
    });
  }
  return list;
}

// --- db (postgres superuser): truncate + superadmin insert -------------------
async function resetDbAndSeedSuperadmin() {
  const pool = new Pool({ connectionString: MIGRATION_DB, max: 1 });
  try {
    // Truncate every table in public except drizzle's migration ledger. CASCADE
    // walks the FK graph so order doesn't matter; RESTART IDENTITY zeroes seqs.
    await pool.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN
          SELECT tablename FROM pg_tables
          WHERE schemaname = 'public' AND tablename NOT LIKE '%drizzle%'
        LOOP
          EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename)
            || ' RESTART IDENTITY CASCADE';
        END LOOP;
      END $$;
    `);
    console.log("✓ Truncated all tables");

    // Super-admin credential. PLATFORM_ADMIN has no tenant and no users-profile
    // row, so userId/tenantId stay null; /auth/manager/login accepts it (that
    // path only rejects role=RESIDENT) and falls sub back to auth_identities.id.
    const hash = await argon2.hash(PASSWORD);
    await pool.query(
      `INSERT INTO auth_identities (role, email, password_hash)
       VALUES ('PLATFORM_ADMIN', $1, $2)`,
      [SUPERADMIN_EMAIL, hash],
    );
    console.log(`✓ Seeded super-admin ${SUPERADMIN_EMAIL}`);
  } finally {
    await pool.end();
  }

  // Clear Redis so no stale OTP/attempt keys survive the reset.
  try {
    execSync(`docker exec ${REDIS_CONTAINER} redis-cli FLUSHALL`, {
      stdio: "ignore",
    });
    console.log("✓ Flushed Redis");
  } catch {
    console.warn("! Could not flush Redis (container name?) — continuing");
  }
}

// --- seed --------------------------------------------------------------------
async function main() {
  await resetDbAndSeedSuperadmin();

  // 1. Platform admin creates the PG owner.
  const pt = platformToken();
  must(
    await call("post", "/platform/owners", pt, {
      name: "Viral Owner",
      email: OWNER_EMAIL,
      password: PASSWORD,
    }),
    "create owner",
  );
  console.log(`✓ Created owner ${OWNER_EMAIL}`);

  // 2. Owner login (global token).
  const ownerToken = must(
    await call("post", "/auth/manager/login", null, {
      email: OWNER_EMAIL,
      password: PASSWORD,
    }),
    "owner login",
  ).accessToken;

  // 3. Owner creates "Bliss Homes" with the first manager inline.
  const pg = must(
    await call("post", "/owner/pgs", ownerToken, {
      name: "Bliss Homes",
      slug: SLUG,
      accentColor: "#7c3aed",
      manager: {
        name: "Viral Manager",
        email: MANAGER_EMAIL,
        password: PASSWORD,
        phone: MANAGER_PHONE,
      },
    }),
    "create PG",
  );
  console.log(`✓ Created PG "${pg.name}" (${pg.slug}) + manager ${MANAGER_EMAIL}`);

  // 4. Manager login → build property as the manager.
  const mgr = must(
    await call("post", "/auth/manager/login", null, {
      email: MANAGER_EMAIL,
      password: PASSWORD,
    }),
    "manager login",
  ).accessToken;

  // 5. Property: 1 building → 5 floors → 10 rooms/floor → beds/room.
  const building = must(
    await call("post", "/property/buildings", mgr, {
      name: "Bliss Block A",
      address: "Bopal, Ahmedabad",
    }),
    "building",
  );
  const beds = [];
  let roomCount = 0;
  for (let f = 1; f <= FLOORS; f++) {
    const floor = must(
      await call("post", "/property/floors", mgr, {
        buildingId: building.id,
        label: `Floor ${f}`,
        floorNumber: f,
      }),
      `floor ${f}`,
    );
    for (let r = 0; r < ROOM_LAYOUT.length; r++) {
      const spec = ROOM_LAYOUT[r];
      const roomLabel = `F${f}-R${String(r + 1).padStart(2, "0")}`;
      const room = must(
        await call("post", "/property/rooms", mgr, {
          floorId: floor.id,
          label: roomLabel,
          capacity: spec.capacity,
          monthlyRentPaise: spec.rentPaise,
        }),
        `room ${roomLabel}`,
      );
      roomCount++;
      for (let b = 0; b < spec.capacity; b++) {
        beds.push(
          must(
            await call("post", "/property/beds", mgr, {
              roomId: room.id,
              label: `${roomLabel}-${BED_LETTERS[b]}`,
            }),
            `bed ${roomLabel}-${BED_LETTERS[b]}`,
          ),
        );
      }
    }
  }
  console.log(`✓ Property: ${FLOORS} floors, ${roomCount} rooms, ${beds.length} beds`);

  // 6. Register residents — viral-resident first, then 20 generic.
  const residentInputs = [
    {
      name: "Viral Resident",
      phone: RESIDENT_PHONE,
      email: RESIDENT_EMAIL,
      occupationType: "PROFESSIONAL",
      nativePlace: "Ahmedabad",
      age: 28,
    },
    ...genericResidents(),
  ];
  const residents = [];
  for (const r of residentInputs) {
    residents.push(must(await call("post", "/residents", mgr, r), `resident ${r.name}`));
    process.stdout.write(".");
  }
  console.log(`\n✓ Registered ${residents.length} residents`);

  // 7. Allocate each resident to a bed (155 beds ≫ 21 residents).
  for (let i = 0; i < residents.length; i++) {
    must(
      await call("post", "/allocations", mgr, {
        bedId: beds[i].id,
        residentId: residents[i].id,
      }),
      `allocate ${residents[i].id}`,
    );
    process.stdout.write(".");
  }
  console.log(`\n✓ Allocated all ${residents.length} residents to beds`);

  await smokeTest();
  printCreds();
}

// --- post-seed verification: every login actually works ----------------------
async function smokeTest() {
  console.log("\nVerifying logins…");
  for (const [label, email] of [
    ["super-admin", SUPERADMIN_EMAIL],
    ["owner", OWNER_EMAIL],
    ["manager", MANAGER_EMAIL],
  ]) {
    const tok = must(
      await call("post", "/auth/manager/login", null, { email, password: PASSWORD }),
      `${label} login`,
    ).accessToken;
    if (!tok) throw new Error(`${label} login returned no token`);
    console.log(`  ✓ ${label} login (${email})`);
  }

  // Resident: slug + phone + OTP. Relies on OTP_DEV_FIXED_CODE=009009 + restart.
  must(
    await call("post", "/auth/resident/otp/request", null, {
      pgCode: SLUG,
      phone: RESIDENT_PHONE,
    }),
    "resident otp request",
  );
  const verify = await call("post", "/auth/resident/otp/verify", null, {
    pgCode: SLUG,
    phone: RESIDENT_PHONE,
    code: "009009",
  });
  if (verify.status >= 300 || !verify.data?.accessToken) {
    throw new Error(
      `resident OTP login FAILED with 009009 (status ${verify.status}). ` +
        `Did you set OTP_DEV_FIXED_CODE=009009 in apps/api/.env and RESTART the API?`,
    );
  }
  console.log(`  ✓ resident login (${SLUG} + ${RESIDENT_PHONE} + OTP 009009)`);
}

function printCreds() {
  console.log("\n────────────────────────────────────────");
  console.log("All passwords: viral@009");
  console.log(`  super-admin : ${SUPERADMIN_EMAIL}`);
  console.log(`  pg-owner    : ${OWNER_EMAIL}`);
  console.log(`  pg-manager  : ${MANAGER_EMAIL}`);
  console.log(`  resident    : ${RESIDENT_EMAIL}`);
  console.log(`     mobile login → slug "${SLUG}", phone ${RESIDENT_PHONE}, OTP 009009`);
  console.log("  Admin app   : http://localhost:3000/login");
  console.log("────────────────────────────────────────\n");
}

main().catch((e) => {
  console.error("\n✗ Seed failed:", e.message);
  process.exit(1);
});
