#!/usr/bin/env node
/**
 * Master seed — creates owner + 2 PGs from scratch.
 *
 *   Owner:      viral-owner@yopmail.com  (password@123)
 *   PG 1:       viral-pg    — viral-manager@yopmail.com    (empty)
 *   PG 2:       shreyank-pg — shreyank-manager@yopmail.com
 *                 5 floors · 10 rooms/floor · 6 beds/room = 300 beds
 *                 230 occupied residents · 12 months paid rent · deposits
 *                 2-week menu cycle · complaints (open+resolved) · announcements
 *
 * Usage:  node apps/api/scripts/seed.mjs
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";

const require = createRequire(import.meta.url);
const { Pool } = require("pg");
const argon2 = require("argon2");

const DB_URL = "postgres://postgres:postgres@localhost:5433/pg_management";
const PASSWORD = "password@123";

const pool = new Pool({ connectionString: DB_URL });

// ─── DB helpers ───────────────────────────────────────────────────────────────

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

async function batchInsert(table, rows, chunkSize = 400) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const ph = chunk
      .map(
        (_, ri) =>
          `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(", ")})`,
      )
      .join(", ");
    const vals = chunk.flatMap((r) => cols.map((c) => r[c]));
    await q(`INSERT INTO ${table} (${cols.join(", ")}) VALUES ${ph}`, vals);
  }
}

// ─── Static data ──────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  "Aarav", "Arjun", "Rohan", "Karan", "Rahul", "Vikram", "Nikhil", "Aditya",
  "Manav", "Siddharth", "Ishaan", "Harsh", "Dev", "Akash", "Ravi", "Priya",
  "Sneha", "Pooja", "Riya", "Kavya", "Tanvi", "Meera", "Deepika", "Nisha",
  "Anjali", "Kritika", "Simran", "Divya", "Ananya", "Shruti",
];
const LAST_NAMES = [
  "Sharma", "Patel", "Gupta", "Joshi", "Singh", "Kumar", "Verma", "Shah",
  "Mehta", "Trivedi", "Nair", "Iyer", "Desai", "Kapoor", "Malhotra",
  "Agarwal", "Yadav", "Reddy", "Pillai", "Menon", "Bhatt", "Saxena",
  "Pandey", "Chaudhary", "Shukla", "Tiwari", "Mishra", "Dubey", "Chauhan", "Khanna",
];
function makeNames(n) {
  const out = [];
  outer: for (const last of LAST_NAMES) {
    for (const first of FIRST_NAMES) {
      out.push(`${first} ${last}`);
      if (out.length >= n) break outer;
    }
  }
  return out;
}

const OCC_TYPES = ["STUDENT", "PROFESSIONAL", "PROFESSIONAL", "STUDENT", "OTHER"];
const NATIVE_PLACES = [
  "Lucknow", "Bhopal", "Kochi", "Nagpur", "Chandigarh", "Chennai", "Vadodara",
  "Amritsar", "Patna", "Thiruvananthapuram", "Hyderabad", "Rajkot", "Agra",
  "Varanasi", "Indore", "Surat", "Coimbatore", "Jaipur", "Kanpur", "Dehradun",
  "Pune", "Mumbai", "Delhi", "Kolkata", "Bengaluru", "Ahmedabad", "Noida",
  "Gurgaon", "Bhubaneswar", "Ranchi",
];

// 12 months: 2025-06 → 2026-05
const RENT_MONTHS = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(2025, 5 + i, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
});

const FLOOR_LABELS = ["Ground Floor", "1st Floor", "2nd Floor", "3rd Floor", "4th Floor"];
const FLOOR_RENTS  = [700000, 750000, 800000, 800000, 850000]; // paise
const BED_LABELS   = ["A", "B", "C", "D", "E", "F"];

const COMPLAINT_DATA = {
  MAINTENANCE: [
    "Water leakage in the bathroom ceiling",
    "Broken ceiling fan in room — needs replacement",
    "Door lock not working properly",
    "AC not cooling — temperature stuck at 28°C",
    "No hot water in the bathroom since yesterday",
    "Electrical socket sparking near the study table",
  ],
  CLEANLINESS: [
    "Common bathroom not cleaned since two days",
    "Corridor needs sweeping — dust accumulated",
    "Trash not collected from the hallway bins",
    "Kitchen area very dirty after dinner service",
    "Dustbin overflowing near the staircase",
  ],
  FOOD: [
    "Lunch was not served on time today",
    "Food quality has gone down considerably this week",
    "Requested menu item was unavailable",
    "Portion size very small at dinner",
    "Food was cold and stale at breakfast",
  ],
  WIFI: [
    "Internet speed is extremely slow since morning",
    "WiFi disconnecting every 10 minutes",
    "No WiFi signal in room on 3rd floor",
    "Router needs restart — no internet connection",
    "Cannot stream video — bandwidth very low",
  ],
  SECURITY: [
    "Main entrance gate left open after midnight",
    "Unknown person spotted in the corridor at night",
    "CCTV camera not working on the 2nd floor",
    "Room door lock broken — security risk for belongings",
  ],
  OTHER: [
    "Noise from nearby construction starts at 7 AM",
    "Common room TV remote is missing",
    "Parking area light is not working at night",
    "Laundry machine making loud noise and stopping mid-cycle",
  ],
};

const ANNOUNCEMENTS = [
  {
    title: "Rent Due Reminder — June 2025",
    body: "Dear residents, please ensure your June 2025 rent is paid by the 5th to avoid late charges. UPI payment details are available in the app under Payments.",
    at: new Date("2025-06-01T10:00:00Z"),
  },
  {
    title: "Scheduled Water Shutdown — July 8",
    body: "There will be a planned water supply shutdown on July 8 from 10 AM to 1 PM for pipeline maintenance. Please store sufficient water in advance.",
    at: new Date("2025-07-07T09:00:00Z"),
  },
  {
    title: "Diwali Celebration in Common Room",
    body: "We are organising a small Diwali celebration on October 20 in the common room at 7 PM. All residents are welcome. Sweets and snacks will be provided!",
    at: new Date("2025-10-18T11:00:00Z"),
  },
  {
    title: "Updated Mess Menu — November Cycle",
    body: "The mess menu has been refreshed for the November cycle. Check the Menu tab in the app for the full 2-week schedule.",
    at: new Date("2025-10-30T10:00:00Z"),
  },
  {
    title: "Visitor Entry Policy Update",
    body: "Effective December 1st, all visitors must register at the reception desk and carry a valid photo ID. This measure is for the safety and security of all residents.",
    at: new Date("2025-11-28T14:00:00Z"),
  },
  {
    title: "Happy New Year 2026!",
    body: "Wishing all residents of Shreyank's Residency a wonderful New Year 2026! We are grateful for your continued trust and look forward to serving you even better.",
    at: new Date("2026-01-01T00:30:00Z"),
  },
];

const MENU = {
  BREAKFAST: [
    "Poha with sev, masala chai",
    "Idli sambar, coconut chutney",
    "Aloo paratha, curd, pickle",
    "Upma with peanuts, orange juice",
    "Bread butter toast, boiled eggs, tea",
    "Aloo poori, halwa",
    "Dosa, sambar, green chutney",
  ],
  LUNCH: [
    "Roti, dal tadka, aloo sabzi, rice, salad",
    "Rajma chawal, roti, raita",
    "Chole bhature, onion salad",
    "Kadhi pakora, jeera rice, roti, papad",
    "Paneer butter masala, dal, rice, roti",
    "Mix veg, dal fry, steamed rice, roti",
    "Dal makhani, jeera rice, roti, papad",
  ],
  DINNER: [
    "Roti, dal, aloo sabzi, rice",
    "Khichdi, papad, mango pickle, curd",
    "Roti, paneer bhurji, moong dal",
    "Roti, aloo jeera, yellow dal",
    "Roti, mix veg, curd rice",
    "Veg fried rice, gobi manchurian",
    "Roti, dal tadka, seasonal sabzi",
  ],
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Hashing password…");
  const pwHash = await argon2.hash(PASSWORD);

  // ── 1. Owner ─────────────────────────────────────────────────────────────────
  console.log("Creating owner…");
  const ownerId = randomUUID();
  await insertOne("owners", {
    id: ownerId,
    name: "Viral Rupani",
    email: "viral-owner@yopmail.com",
    created_at: new Date(),
  });
  await insertOne("auth_identities", {
    id: randomUUID(),
    tenant_id: null,
    role: "PG_OWNER",
    user_id: ownerId,
    email: "viral-owner@yopmail.com",
    password_hash: pwHash,
    must_change_password: false,
    created_at: new Date(),
  });
  console.log("✓ Owner: viral-owner@yopmail.com");

  // ── 2. Helper: create tenant + owner-link + manager ───────────────────────
  async function createPG(name, slug, accent, mgrName, mgrEmail, mgrPhone) {
    const tenantId = randomUUID();
    await insertOne("tenants", {
      id: tenantId,
      name,
      slug,
      accent_color: accent,
      status: "ACTIVE",
      created_at: new Date(),
    });
    // PG_OWNER users row (owner's in-PG actor)
    const ownerUserId = randomUUID();
    await insertOne("users", {
      id: ownerUserId,
      tenant_id: tenantId,
      role: "PG_OWNER",
      name: "Viral Rupani",
      status: "ACTIVE",
      created_at: new Date(),
    });
    await insertOne("owner_tenants", {
      id: randomUUID(),
      owner_id: ownerId,
      tenant_id: tenantId,
      user_id: ownerUserId,
      created_at: new Date(),
    });
    // Manager
    const mgrUserId = randomUUID();
    await insertOne("users", {
      id: mgrUserId,
      tenant_id: tenantId,
      role: "PG_MANAGER",
      name: mgrName,
      phone: mgrPhone,
      email: mgrEmail,
      status: "ACTIVE",
      created_at: new Date(),
    });
    await insertOne("auth_identities", {
      id: randomUUID(),
      tenant_id: tenantId,
      role: "PG_MANAGER",
      user_id: mgrUserId,
      email: mgrEmail,
      password_hash: pwHash,
      must_change_password: false,
      created_at: new Date(),
    });
    return { tenantId, mgrUserId };
  }

  // ── 3. Viral's PG (empty) ─────────────────────────────────────────────────
  console.log("Creating Viral's PG (empty)…");
  await createPG(
    "Viral's PG Homes", "viral-pg", "#6366F1",
    "Viral Manager", "viral-manager@yopmail.com", "9800000001",
  );
  console.log("✓ Viral's PG: viral-manager@yopmail.com (empty)");

  // ── 4. Shreyank's PG ─────────────────────────────────────────────────────
  console.log("Creating Shreyank's PG…");
  const { tenantId, mgrUserId } = await createPG(
    "Shreyank's Residency", "shreyank-pg", "#10B981",
    "Shreyank Manager", "shreyank-manager@yopmail.com", "9800000002",
  );

  // Building
  const buildingId = randomUUID();
  await insertOne("buildings", {
    id: buildingId,
    tenant_id: tenantId,
    name: "Main Block",
    address: "42, Satellite Road, Ahmedabad, Gujarat 380015",
    created_at: new Date(),
  });

  // Generate floors → rooms → beds in memory, then batch insert
  const floorRows = [];
  const roomRows  = [];
  const bedRows   = [];
  const bedsData  = []; // {id, rentPaise} in bed-index order

  for (let fi = 0; fi < 5; fi++) {
    const floorId  = randomUUID();
    const rentPaise = FLOOR_RENTS[fi];
    const prefix   = fi === 0 ? "G" : `${fi}`;

    floorRows.push({
      id: floorId,
      tenant_id: tenantId,
      building_id: buildingId,
      label: FLOOR_LABELS[fi],
      floor_number: fi,
      created_at: new Date(),
    });

    for (let ri = 0; ri < 10; ri++) {
      const roomId = randomUUID();
      roomRows.push({
        id: roomId,
        tenant_id: tenantId,
        floor_id: floorId,
        label: `${prefix}-${String(ri + 1).padStart(2, "0")}`,
        capacity: 6,
        monthly_rent_paise: rentPaise,
        created_at: new Date(),
      });

      for (let bi = 0; bi < 6; bi++) {
        const bedId = randomUUID();
        bedRows.push({
          id: bedId,
          tenant_id: tenantId,
          room_id: roomId,
          label: BED_LABELS[bi],
          status: "VACANT",
          created_at: new Date(),
        });
        bedsData.push({ id: bedId, rentPaise });
      }
    }
  }

  console.log(`  Inserting 5 floors, 50 rooms, ${bedRows.length} beds…`);
  await batchInsert("floors", floorRows);
  await batchInsert("rooms", roomRows);
  await batchInsert("beds", bedRows);

  // ── Residents (230) ───────────────────────────────────────────────────────
  console.log("  Creating 230 residents…");
  const names = makeNames(230);
  const JOIN_DATE = new Date("2025-05-01T00:00:00Z");

  const userRows   = [];
  const authRows   = [];
  const resData    = []; // {userId, bedId, rentPaise}

  for (let i = 0; i < 230; i++) {
    const userId = randomUUID();
    const phone  = `800000${String(i + 1).padStart(4, "0")}`;

    userRows.push({
      id: userId,
      tenant_id: tenantId,
      role: "RESIDENT",
      name: names[i],
      phone,
      age: 19 + (i % 17),
      occupation_type: OCC_TYPES[i % OCC_TYPES.length],
      native_place: NATIVE_PLACES[i % NATIVE_PLACES.length],
      status: "ACTIVE",
      join_date: JOIN_DATE,
      created_at: JOIN_DATE,
    });
    authRows.push({
      id: randomUUID(),
      tenant_id: tenantId,
      role: "RESIDENT",
      user_id: userId,
      phone,
      must_change_password: false,
      created_at: JOIN_DATE,
    });
    resData.push({ userId, bedId: bedsData[i].id, rentPaise: bedsData[i].rentPaise });
  }

  await batchInsert("users", userRows);
  await batchInsert("auth_identities", authRows);
  console.log("  ✓ Residents registered");

  // ── Allocations + occupied bed status ────────────────────────────────────
  console.log("  Allocating residents to beds…");
  const allocRows = resData.map(({ userId, bedId }) => ({
    id: randomUUID(),
    tenant_id: tenantId,
    bed_id: bedId,
    resident_id: userId,
    start_date: JOIN_DATE,
    end_date: null,
    created_at: JOIN_DATE,
  }));
  await batchInsert("allocations", allocRows);

  // Mark occupied beds
  const occupiedIds = resData.map((r) => r.bedId);
  for (let i = 0; i < occupiedIds.length; i += 500) {
    const chunk = occupiedIds.slice(i, i + 500);
    const ph = chunk.map((_, j) => `$${j + 1}`).join(", ");
    await q(`UPDATE beds SET status = 'OCCUPIED' WHERE id IN (${ph})`, chunk);
  }
  console.log("  ✓ Allocations done");

  // ── Deposits ──────────────────────────────────────────────────────────────
  console.log("  Creating deposits…");
  const depositRows = resData.map(({ userId, rentPaise }) => ({
    id: randomUUID(),
    tenant_id: tenantId,
    resident_id: userId,
    amount_paise: rentPaise,
    status: "HELD",
    created_at: JOIN_DATE,
  }));
  await batchInsert("deposits", depositRows);
  console.log("  ✓ Deposits created");

  // ── Invoices + Payments (12 months × 230 residents) ──────────────────────
  console.log(`  Creating invoices and payments for ${RENT_MONTHS.length} months × 230 residents…`);
  const invoiceRows = [];
  const paymentRows = [];

  for (const period of RENT_MONTHS) {
    const [yr, mo] = period.split("-").map(Number);
    const dueDate  = new Date(Date.UTC(yr, mo - 1, 5));
    const paidAt   = new Date(Date.UTC(yr, mo - 1, 8, 10, 0, 0));

    for (const { userId, rentPaise } of resData) {
      const invoiceId = randomUUID();
      invoiceRows.push({
        id: invoiceId,
        tenant_id: tenantId,
        resident_id: userId,
        period,
        amount_paise: rentPaise,
        due_date: dueDate,
        status: "PAID",
        created_at: dueDate,
      });
      paymentRows.push({
        id: randomUUID(),
        tenant_id: tenantId,
        invoice_id: invoiceId,
        resident_id: userId,
        amount_paise: rentPaise,
        method: "CASH",
        status: "APPROVED",
        reviewed_by_user_id: mgrUserId,
        reviewed_at: paidAt,
        created_at: paidAt,
      });
    }
  }

  await batchInsert("invoices", invoiceRows);
  console.log(`  ✓ ${invoiceRows.length} invoices inserted`);
  await batchInsert("payments", paymentRows);
  console.log(`  ✓ ${paymentRows.length} payments inserted`);

  // ── Menu (2-week cycle) ───────────────────────────────────────────────────
  console.log("  Creating 2-week menu…");
  await insertOne("menu_config", {
    tenant_id: tenantId,
    cycle_length_weeks: 2,
    cycle_start_date: "2025-06-02", // Monday
    updated_at: new Date(),
  });

  const menuSlotRows = [];
  for (let week = 1; week <= 2; week++) {
    for (let dow = 1; dow <= 7; dow++) {
      const idx = dow - 1;
      for (const mealType of ["BREAKFAST", "LUNCH", "DINNER"]) {
        menuSlotRows.push({
          id: randomUUID(),
          tenant_id: tenantId,
          week_number: week,
          day_of_week: dow,
          meal_type: mealType,
          items: MENU[mealType][idx],
          updated_at: new Date(),
        });
      }
    }
  }
  await batchInsert("menu_slots", menuSlotRows);
  console.log("  ✓ Menu created (2 weeks × 7 days × 3 meals)");

  // ── Complaints: 25 resolved + 15 open ────────────────────────────────────
  console.log("  Creating complaints…");
  const categories = Object.keys(COMPLAINT_DATA);
  const complaintRows = [];

  // 25 RESOLVED (spread across first 50 residents)
  for (let i = 0; i < 25; i++) {
    const cat  = categories[i % categories.length];
    const desc = COMPLAINT_DATA[cat][i % COMPLAINT_DATA[cat].length];
    const createdAt = new Date(Date.UTC(2025, 6 + (i % 6), 3 + (i % 20)));
    const resolvedAt = new Date(createdAt.getTime() + 3 * 24 * 60 * 60 * 1000);
    complaintRows.push({
      id: randomUUID(),
      tenant_id: tenantId,
      resident_id: resData[i].userId,
      category: cat,
      description: desc,
      status: "RESOLVED",
      assigned_to_user_id: mgrUserId,
      resolved_at: resolvedAt,
      created_at: createdAt,
    });
  }

  // 15 OPEN (spread across next 15 residents)
  for (let i = 0; i < 15; i++) {
    const cat  = categories[i % categories.length];
    const desc = COMPLAINT_DATA[cat][(i + 2) % COMPLAINT_DATA[cat].length];
    const createdAt = new Date(Date.UTC(2026, 2 + (i % 3), 5 + (i % 18)));
    complaintRows.push({
      id: randomUUID(),
      tenant_id: tenantId,
      resident_id: resData[50 + i].userId,
      category: cat,
      description: desc,
      status: "OPEN",
      assigned_to_user_id: null,
      resolved_at: null,
      created_at: createdAt,
    });
  }

  await batchInsert("complaints", complaintRows);
  console.log("  ✓ 25 resolved + 15 open complaints");

  // ── Announcements ─────────────────────────────────────────────────────────
  console.log("  Creating announcements…");
  const announcementRows = ANNOUNCEMENTS.map((a) => ({
    id: randomUUID(),
    tenant_id: tenantId,
    title: a.title,
    body: a.body,
    audience_type: "ALL",
    audience_label: "Everyone",
    created_by_user_id: mgrUserId,
    created_at: a.at,
  }));
  await batchInsert("announcements", announcementRows);
  console.log("  ✓ 6 announcements created");

  await pool.end();

  console.log("\n✅ Seed complete!\n");
  console.log("  Accounts (password: password@123)");
  console.log("  ─────────────────────────────────────────────────────────");
  console.log("  Owner:            viral-owner@yopmail.com");
  console.log("  Viral's manager:  viral-manager@yopmail.com   (viral-pg — empty)");
  console.log("  Shreyank's mgr:   shreyank-manager@yopmail.com (shreyank-pg)");
  console.log("  ─────────────────────────────────────────────────────────");
  console.log("  Shreyank's PG:    5 floors · 300 beds · 230 occupied residents");
  console.log(`                    ${invoiceRows.length} invoices + ${paymentRows.length} payments (12 months, all PAID)`);
  console.log("                    230 deposits (HELD) · 2-week menu");
  console.log("                    25 resolved + 15 open complaints · 6 announcements");
}

main().catch((err) => {
  console.error("✗ Seed failed:", err.message);
  pool.end();
  process.exit(1);
});
