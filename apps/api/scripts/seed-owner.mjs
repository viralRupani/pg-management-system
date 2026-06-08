#!/usr/bin/env node
/**
 * Demo seed for the PG-OWNER flow. Mints a PLATFORM_ADMIN token, creates an
 * owner, logs the owner in (global token), and creates two PGs (one with an
 * inline first manager) so the admin app's owner surface has data: the /pgs
 * chooser, PG switch, dashboard theming, and /managers all light up.
 *
 * Super-admin has no login endpoint, so we mint the token directly with
 * JWT_ACCESS_SECRET (same trick as the e2e harness / seed-demo).
 *
 * Requires: infra up + migrated, and the API running on $API (default :4000).
 * Idempotent-ish: fixed owner email + slugs → re-runs hit 409s and stop.
 *
 *   node apps/api/scripts/seed-owner.mjs
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
  } catch {
    /* defaults */
  }
  return env;
}
const ACCESS_SECRET = loadEnv().JWT_ACCESS_SECRET ?? "dev-access-secret-change-me";

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

const OWNER_EMAIL = "owner@pgowner.demo";
const PASSWORD = "password123";

async function main() {
  const pt = platformToken();

  // 1. Create the owner (fixed email → 409 on re-run).
  const created = await call("post", "/platform/owners", pt, {
    name: "Owner Demo",
    email: OWNER_EMAIL,
    password: PASSWORD,
  });
  if (created.status === 409) {
    console.log(`Owner "${OWNER_EMAIL}" already exists — skipping seed.`);
    printCreds();
    return;
  }
  must(created, "create owner");
  console.log(`✓ Created owner ${OWNER_EMAIL}`);

  // 2. Owner login (global token).
  const ownerToken = must(
    await call("post", "/auth/manager/login", null, {
      email: OWNER_EMAIL,
      password: PASSWORD,
    }),
    "owner login",
  ).accessToken;

  // 3. Create two PGs — one bare, one with an inline first manager.
  const pgA = must(
    await call("post", "/owner/pgs", ownerToken, {
      name: "Maple Residency",
      slug: "maple-residency",
      accentColor: "#7c3aed", // violet
    }),
    "create PG A",
  );
  const pgB = must(
    await call("post", "/owner/pgs", ownerToken, {
      name: "Cedar House",
      slug: "cedar-house",
      accentColor: "#0d9488", // teal
      manager: {
        name: "Neha Verma",
        email: "neha@cedarhouse.demo",
        password: PASSWORD,
        phone: "+919812345678",
      },
    }),
    "create PG B",
  );
  console.log(`✓ Created 2 PGs: ${pgA.name} (${pgA.slug}), ${pgB.name} (${pgB.slug})`);

  printCreds();
}

function printCreds() {
  console.log("\n────────────────────────────────────────");
  console.log("Owner login (admin app):");
  console.log(`  URL:      http://localhost:3000/login`);
  console.log(`  Email:    ${OWNER_EMAIL}`);
  console.log(`  Password: ${PASSWORD}`);
  console.log("  → lands on /pgs (the PG chooser). Open a PG, then 'Managers'.");
  console.log("────────────────────────────────────────\n");
}

main().catch((e) => {
  console.error("✗ Seed failed:", e.message);
  process.exit(1);
});
