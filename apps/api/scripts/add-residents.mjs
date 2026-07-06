#!/usr/bin/env node
/**
 * Adds 20 new residents (plus more rooms/beds) to the existing "sunrise-pg" seed.
 * Run AFTER seed-demo.mjs has already been executed.
 *
 *   node apps/api/scripts/add-residents.mjs
 */
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API = process.env.API ?? "http://localhost:4000";

function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync(resolve(__dirname, "../.env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* fall through */ }
  return env;
}

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

const SLUG = "sunrise-pg";
const MANAGER_EMAIL = "manager@sunrise.pg";
const PASSWORD = "password123";

const NEW_RESIDENTS = [
  { name: "Rohan Gupta",       phone: "9800000106", occupationType: "PROFESSIONAL", nativePlace: "Lucknow",      age: 27 },
  { name: "Priya Verma",       phone: "9800000107", occupationType: "STUDENT",      nativePlace: "Bhopal",       age: 20 },
  { name: "Arjun Nair",        phone: "9800000108", occupationType: "PROFESSIONAL", nativePlace: "Kochi",        age: 30 },
  { name: "Sneha Joshi",       phone: "9800000109", occupationType: "STUDENT",      nativePlace: "Nagpur",       age: 22 },
  { name: "Karan Malhotra",    phone: "9800000110", occupationType: "PROFESSIONAL", nativePlace: "Chandigarh",   age: 29 },
  { name: "Pooja Iyer",        phone: "9800000111", occupationType: "STUDENT",      nativePlace: "Chennai",      age: 21 },
  { name: "Nikhil Desai",      phone: "9800000112", occupationType: "PROFESSIONAL", nativePlace: "Vadodara",     age: 31 },
  { name: "Riya Kapoor",       phone: "9800000113", occupationType: "OTHER",        nativePlace: "Amritsar",     age: 25 },
  { name: "Aditya Kumar",      phone: "9800000114", occupationType: "PROFESSIONAL", nativePlace: "Patna",        age: 28 },
  { name: "Meera Pillai",      phone: "9800000115", occupationType: "STUDENT",      nativePlace: "Thiruvananthapuram", age: 19 },
  { name: "Siddharth Reddy",   phone: "9800000116", occupationType: "PROFESSIONAL", nativePlace: "Hyderabad",    age: 32 },
  { name: "Ishaan Bhatt",      phone: "9800000117", occupationType: "STUDENT",      nativePlace: "Rajkot",       age: 23 },
  { name: "Tanvi Saxena",      phone: "9800000118", occupationType: "OTHER",        nativePlace: "Agra",         age: 26 },
  { name: "Vikram Yadav",      phone: "9800000119", occupationType: "PROFESSIONAL", nativePlace: "Varanasi",     age: 34 },
  { name: "Nisha Pandey",      phone: "9800000120", occupationType: "STUDENT",      nativePlace: "Indore",       age: 21 },
  { name: "Harsh Trivedi",     phone: "9800000121", occupationType: "PROFESSIONAL", nativePlace: "Surat",        age: 27 },
  { name: "Kavya Menon",       phone: "9800000122", occupationType: "STUDENT",      nativePlace: "Coimbatore",   age: 20 },
  { name: "Rahul Chaudhary",   phone: "9800000123", occupationType: "PROFESSIONAL", nativePlace: "Jaipur",       age: 33 },
  { name: "Deepika Shukla",    phone: "9800000124", occupationType: "OTHER",        nativePlace: "Kanpur",       age: 24 },
  { name: "Manav Agarwal",     phone: "9800000125", occupationType: "PROFESSIONAL", nativePlace: "Dehradun",     age: 29 },
];

async function main() {
  // Manager login
  const mgr = must(
    await call("post", "/auth/manager/login", null, { email: MANAGER_EMAIL, password: PASSWORD }),
    "manager login",
  ).accessToken;
  console.log("✓ Manager logged in");

  // Fetch existing buildings to attach new rooms to block A
  const buildings = must(await call("get", "/property/buildings", mgr), "list buildings");
  const blockA = buildings.find((b) => b.name === "Sunrise Block A");
  if (!blockA) throw new Error("Block A not found — run seed-demo.mjs first");

  // Fetch floors
  const floors = must(await call("get", `/property/floors?buildingId=${blockA.id}`, mgr), "list floors");
  const groundFloor = floors[0];

  // Add two new rooms (G-102 and G-103) with enough beds for all 20 residents
  const room102 = must(
    await call("post", "/property/rooms", mgr, { floorId: groundFloor.id, label: "G-102", capacity: 4, monthlyRentPaise: 750000 }),
    "room G-102",
  );
  const room103 = must(
    await call("post", "/property/rooms", mgr, { floorId: groundFloor.id, label: "G-103", capacity: 4, monthlyRentPaise: 700000 }),
    "room G-103",
  );

  // Add a second floor with two more rooms
  const floor1 = must(
    await call("post", "/property/floors", mgr, { buildingId: blockA.id, label: "First Floor", floorNumber: 1 }),
    "floor 1",
  );
  const room201 = must(
    await call("post", "/property/rooms", mgr, { floorId: floor1.id, label: "F-201", capacity: 4, monthlyRentPaise: 850000 }),
    "room F-201",
  );
  const room202 = must(
    await call("post", "/property/rooms", mgr, { floorId: floor1.id, label: "F-202", capacity: 4, monthlyRentPaise: 850000 }),
    "room F-203",
  );
  const room203 = must(
    await call("post", "/property/rooms", mgr, { floorId: floor1.id, label: "F-203", capacity: 4, monthlyRentPaise: 900000 }),
    "room F-203",
  );

  console.log("✓ Added 5 new rooms across ground + first floor");

  // Create 4 beds in each new room (20 beds total)
  const newBeds = [];
  for (const [room, prefix] of [
    [room102, "G-102"],
    [room103, "G-103"],
    [room201, "F-201"],
    [room202, "F-202"],
    [room203, "F-203"],
  ]) {
    for (const label of ["A", "B", "C", "D"]) {
      newBeds.push(
        must(await call("post", "/property/beds", mgr, { roomId: room.id, label: `${prefix}-${label}` }), `bed ${prefix}-${label}`),
      );
    }
  }
  console.log(`✓ Created ${newBeds.length} new beds`);

  // Register all 20 residents
  const residents = [];
  for (const r of NEW_RESIDENTS) {
    residents.push(must(await call("post", "/residents", mgr, r), `resident ${r.name}`));
    process.stdout.write(".");
  }
  console.log(`\n✓ Registered ${residents.length} residents`);

  // Allocate all 20 residents to the 20 new beds
  for (let i = 0; i < residents.length; i++) {
    must(
      await call("post", "/allocations", mgr, { bedId: newBeds[i].id, residentId: residents[i].id }),
      `allocate ${residents[i].id}`,
    );
    process.stdout.write(".");
  }
  console.log(`\n✓ Allocated all 20 residents to beds`);

  console.log("\nDone! 20 new residents added and allocated.");
}

main().catch((e) => {
  console.error("✗ Failed:", e.message);
  process.exit(1);
});
