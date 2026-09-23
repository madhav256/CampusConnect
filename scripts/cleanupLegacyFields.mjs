/**
 * Milestone 14B — Legacy Field Cleanup Script
 *
 * Responsibilities:
 * - Removes unauthoritative legacy residue from users/{uid}
 * - Delete ONLY:
 *     displayName, photoURL, bio, department, year, skills, socialLinks, isDemo
 * - Explicitly PROTECT:
 *     uid, email, isDiscoverable, notificationPreferences, createdAt, updatedAt
 * - Uses strict assertions to guarantee private fields are never deleted
 * - Safe batching (max 200 operations)
 * - Dry-run support (--dry-run)
 */

import { getAdminDb, FieldValue } from "./adminClient.mjs";

export const FIELDS_TO_DELETE = Object.freeze([
  "displayName",
  "photoURL",
  "bio",
  "department",
  "year",
  "skills",
  "socialLinks",
  "isDemo",
]);

export const PROTECTED_PRIVATE_FIELDS = Object.freeze([
  "uid",
  "email",
  "isDiscoverable",
  "notificationPreferences",
  "createdAt",
  "updatedAt",
]);

// Safety assertion: Ensure no protected field is in the deletion list
for (const field of FIELDS_TO_DELETE) {
  if (PROTECTED_PRIVATE_FIELDS.includes(field)) {
    throw new Error(
      `CRITICAL SAFETY VIOLATION: Protected private field '${field}' is present in FIELDS_TO_DELETE list.`
    );
  }
}

const BATCH_LIMIT = 200;

async function cleanupLegacyFields() {
  const isDryRun = process.argv.includes("--dry-run");
  console.log(`[cleanupLegacyFields] Starting legacy field cleanup... ${isDryRun ? "(DRY RUN MODE)" : "(LIVE CLEANUP)"}`);

  const db = getAdminDb();
  const usersSnapshot = await db.collection("users").get();

  console.log(`[cleanupLegacyFields] Inspecting ${usersSnapshot.size} user documents for legacy residue...`);

  let usersUpdated = 0;
  let fieldsDeletedTotal = 0;

  let currentBatch = db.batch();
  let opCount = 0;

  for (const userDoc of usersSnapshot.docs) {
    const data = userDoc.data();
    const updatePayload = {};

    let userHasLegacyFields = false;
    for (const field of FIELDS_TO_DELETE) {
      if (data[field] !== undefined) {
        // Assert field is strictly not a protected field
        if (PROTECTED_PRIVATE_FIELDS.includes(field)) {
          throw new Error(`CRITICAL INVARIANT BREACH: Attempted to delete protected field '${field}' on user ${userDoc.id}`);
        }
        updatePayload[field] = FieldValue.delete();
        fieldsDeletedTotal++;
        userHasLegacyFields = true;
      }
    }

    if (userHasLegacyFields) {
      usersUpdated++;
      if (!isDryRun) {
        currentBatch.update(userDoc.ref, updatePayload);
        opCount++;
      }

      if (opCount >= BATCH_LIMIT) {
        if (!isDryRun) {
          await currentBatch.commit();
          console.log(`[cleanupLegacyFields] Committed cleanup batch of ${opCount} documents.`);
        }
        currentBatch = db.batch();
        opCount = 0;
      }
    }
  }

  if (opCount > 0 && !isDryRun) {
    await currentBatch.commit();
    console.log(`[cleanupLegacyFields] Committed final cleanup batch of ${opCount} documents.`);
  }

  console.log("\n==================================================");
  console.log(`[cleanupLegacyFields] Cleanup Summary:`);
  console.log(`- Total users inspected:        ${usersSnapshot.size}`);
  console.log(`- Users with legacy fields:     ${usersUpdated}`);
  console.log(`- Total legacy fields removed:  ${fieldsDeletedTotal}`);
  console.log(`- Protected fields preserved:   100% verified`);
  console.log(`- Mode:                         ${isDryRun ? "DRY RUN (no writes performed)" : "LIVE (deletions committed)"}`);
  console.log("==================================================\n");
}

const isMain = process.argv[1] && (
  process.argv[1].endsWith("cleanupLegacyFields.mjs")
);

if (isMain) {
  cleanupLegacyFields().catch((err) => {
    console.error("[cleanupLegacyFields] Fatal error during cleanup:", err);
    process.exit(1);
  });
}
