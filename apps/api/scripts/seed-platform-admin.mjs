#!/usr/bin/env node
/**
 * Seed (or upsert) the PLATFORM super-admin credential and T&C version 1.
 *
 * The platform admin is the SaaS operator: the only principal that publishes
 * Terms & Conditions. It has NO tenant and NO `users` row — just an
 * `auth_identities` row (tenant_id null, user_id null, role PLATFORM_ADMIN,
 * password set). `managerLogin` accepts it (any password identity except
 * RESIDENT), minting a token { sub: identity.id, tenantId: null, role:
 * PLATFORM_ADMIN }.
 *
 * Credentials come from ENV — NEVER hardcoded here (standing instruction):
 *   PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD  (required)
 *   DATABASE_URL (optional; defaults to the local dev Postgres on :5433)
 *
 * Usage:
 *   PLATFORM_ADMIN_EMAIL=admin@basera.app PLATFORM_ADMIN_PASSWORD='…' \
 *     node apps/api/scripts/seed-platform-admin.mjs
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";

const require = createRequire(import.meta.url);
const { Pool } = require("pg");
const argon2 = require("argon2");

const DB_URL =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5433/pg_management";
const EMAIL = process.env.PLATFORM_ADMIN_EMAIL;
const PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error(
    "✗ Set PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD in the environment.",
  );
  process.exit(1);
}

// Professional, legally protective T&C — platform is only a management tool;
// PG owners/managers are solely responsible for the tenancy relationship. Plain
// numbered sections for clean whitespace-pre-line rendering in the admin app.
const TC_V1_BODY = `Terms & Conditions

Last updated: on publication

Please read these Terms & Conditions ("Terms") carefully. By accessing or using this platform ("the Service"), you ("you", "the User", a PG owner or manager) agree to be bound by these Terms. If you do not agree, do not use the Service.

1. Nature of the Service
The Service is a software management tool for operating paying-guest (PG) and hostel accommodations — including recording residents, beds, rent, deposits, complaints, and related operational data. The Service is a tool only. It does not act as a landlord, agent, broker, escrow, payment processor, or party to any agreement between you and your residents.

2. Your Responsibilities
You are solely responsible for the operation of your property, including but not limited to: collecting rent and deposits; making utility, tax, and other payments; verifying the identity and eligibility of residents; drafting and enforcing rental agreements; and complying with all applicable laws, licensing, and regulations. The Service does not perform, guarantee, or supervise any of these on your behalf.

3. Payments and Financial Matters
The Service does not process payments and holds no funds. Any rent, deposit, or other money is transacted directly between you and your residents outside the Service. You are responsible for reconciling every transaction. The platform is not liable for missed, late, partial, incorrect, or fraudulent payments, chargebacks, or any financial loss arising from your use of the Service.

4. No Liability for Disputes
Any dispute, claim, or disagreement between you and a resident (or any third party) — including over money, occupancy, conduct, property damage, or termination — is entirely between the parties involved. The platform is not a party to and accepts no liability for any such dispute.

5. Accuracy of Data
You are responsible for the accuracy, completeness, and lawfulness of all data you enter into the Service. The platform does not verify your data and is not liable for any consequence of inaccurate, outdated, or unlawful information you record.

6. Service Availability
The Service is provided on an "as is" and "as available" basis. We do not guarantee uninterrupted or error-free availability; maintenance, outages, or technical issues may occur, and features may change or be discontinued. You are responsible for keeping your own records.

7. Account Security
You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account. Notify us promptly of any unauthorized access. The platform is not liable for loss arising from compromised credentials.

8. Acceptable Use
You must not use the Service for any illegal, fraudulent, or unauthorized purpose, or in any way that infringes the rights of others or violates applicable law.

9. Limitation of Liability
To the maximum extent permitted by law, the platform and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or for any loss of profits, revenue, data, or goodwill, arising from your use of or inability to use the Service.

10. Changes to These Terms
We may update these Terms from time to time. When a new version is published, continued use of the Service requires acceptance of the latest version. It is your responsibility to review the Terms when prompted.

By selecting "I have read and agree" and continuing, you acknowledge that you have read, understood, and accepted these Terms & Conditions.`;

const pool = new Pool({ connectionString: DB_URL });

async function q(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function main() {
  console.log("Hashing platform-admin password…");
  const pwHash = await argon2.hash(PASSWORD);

  // ── Platform-admin credential (upsert by email) ─────────────────────────────
  const [existing] = await q(
    `SELECT id FROM auth_identities WHERE email = $1 AND role = 'PLATFORM_ADMIN'`,
    [EMAIL],
  );
  if (existing) {
    await q(
      `UPDATE auth_identities
         SET password_hash = $1, must_change_password = false
       WHERE id = $2`,
      [pwHash, existing.id],
    );
    console.log(`✓ Updated platform admin: ${EMAIL}`);
  } else {
    await q(
      `INSERT INTO auth_identities
         (id, tenant_id, role, user_id, email, password_hash, must_change_password, created_at)
       VALUES ($1, NULL, 'PLATFORM_ADMIN', NULL, $2, $3, false, now())`,
      [randomUUID(), EMAIL, pwHash],
    );
    console.log(`✓ Created platform admin: ${EMAIL}`);
  }

  // ── T&C version 1 (only if nothing is published yet) ────────────────────────
  const [anyVersion] = await q(`SELECT id FROM tc_versions LIMIT 1`);
  if (anyVersion) {
    console.log("• T&C already published — leaving versions untouched.");
  } else {
    await q(
      `INSERT INTO tc_versions (id, version, body, published_by_email, published_at)
       VALUES ($1, 1, $2, $3, now())`,
      [randomUUID(), TC_V1_BODY, EMAIL],
    );
    console.log("✓ Seeded T&C version 1");
  }

  await pool.end();
  console.log("\n✅ Platform-admin seed complete.");
  console.log(`   Login at the admin app with: ${EMAIL}`);
}

main().catch((err) => {
  console.error("✗ Platform-admin seed failed:", err.message);
  pool.end();
  process.exit(1);
});
