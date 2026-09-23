/**
 * Milestone 14B — Private Schema Verification Script
 *
 * Responsibilities:
 * - Scans all documents in users collection
 * - Verifies that each document contains ONLY the allowed private fields:
 *     uid, email, isDiscoverable, notificationPreferences, createdAt, updatedAt
 * - Any unexpected or legacy field causes immediate verification failure (exit code 1)
 */

import { getAdminDb } from "./adminClient.mjs";

export const ALLOWED_PRIVATE_KEYS = Object.freeze([
  "uid",
  "email",
  "isDiscoverable",
  "notificationPreferences",
  "createdAt",
  "updatedAt",
]);

async function verifyPrivateSchema() {
  console.log("[verifyPrivateSchema] Starting verification of users collection private schema...");

  const db = getAdminDb();
  const usersSnapshot = await db.collection("users").get();

  console.log(`[verifyPrivateSchema] Inspecting ${usersSnapshot.size} user documents...`);

  const violations = [];

  for (const userDoc of usersSnapshot.docs) {
    const uid = userDoc.id;
    const data = userDoc.data();
    const docKeys = Object.keys(data);

    const unexpectedKeys = docKeys.filter((k) => !ALLOWED_PRIVATE_KEYS.includes(k));
    const missingRequiredKeys = ALLOWED_PRIVATE_KEYS.filter((k) => !(k in data));

    if (unexpectedKeys.length > 0 || missingRequiredKeys.length > 0) {
      violations.push({
        uid,
        unexpectedKeys,
        missingRequiredKeys,
      });
    }
  }

  console.log("\n==================================================");
  console.log("[verifyPrivateSchema] Verification Results:");
  console.log(`- Total users inspected:  ${usersSnapshot.size}`);
  console.log(`- Schema violations:     ${violations.length}`);
  console.log("==================================================");

  if (violations.length > 0) {
    console.error("\n❌ VERIFICATION FAILED: Found user documents violating the private schema:\n");
    for (const v of violations) {
      console.error(`User: ${v.uid}`);
      if (v.unexpectedKeys.length > 0) {
        console.error(`  - Unexpected keys: ${v.unexpectedKeys.join(", ")}`);
      }
      if (v.missingRequiredKeys.length > 0) {
        console.error(`  - Missing keys:    ${v.missingRequiredKeys.join(", ")}`);
      }
    }
    process.exit(1);
  }

  console.log("\n✓ VERIFICATION PASSED: All user documents strictly conform to the 6-field private schema.\n");
}

const isMain = process.argv[1] && (
  process.argv[1].endsWith("verifyPrivateSchema.mjs")
);

if (isMain) {
  verifyPrivateSchema().catch((err) => {
    console.error("[verifyPrivateSchema] Fatal error during schema verification:", err);
    process.exit(1);
  });
}
