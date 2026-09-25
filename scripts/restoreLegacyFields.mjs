/**
 * Milestone 14B — Legacy Field Restoration Script
 *
 * Responsibilities:
 * - Provides rollback recovery for the legacy fields intentionally deleted by Milestone 14B
 * - Reads an authoritative snapshot created by snapshotLegacyFields.mjs
 * - Restores ONLY the 8 fields intentionally deleted by cleanupLegacyFields.mjs:
 *     displayName, photoURL, bio, department, year, skills, socialLinks, isDemo
 * - STRICTLY FORBIDS writing any private account field:
 *     uid, email, isDiscoverable, notificationPreferences, createdAt, updatedAt
 * - Preserves null, empty strings, arrays, and nested socialLinks structures
 * - For isDemo:
 *     - restores the original presence/value when using the current snapshot schema
 *     - backward-compatible older snapshots only restore explicitly true
 * - Safe Admin SDK batch writes (max 200 operations per batch)
 * - Idempotent execution
 * - Dry-run support (--dry-run)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAdminDb } from "./adminClient.mjs";

const __filename = fileURLToPath(import.meta.url);

export const RESTORABLE_FIELDS = Object.freeze([
  "displayName",
  "photoURL",
  "bio",
  "department",
  "year",
  "skills",
  "socialLinks",
  "isDemo",
]);

export const FORBIDDEN_PRIVATE_FIELDS = Object.freeze([
  "uid",
  "email",
  "isDiscoverable",
  "notificationPreferences",
  "createdAt",
  "updatedAt",
]);

// Safety assertion: Ensure no forbidden private field is ever in RESTORABLE_FIELDS
for (const field of FORBIDDEN_PRIVATE_FIELDS) {
  if (RESTORABLE_FIELDS.includes(field)) {
    throw new Error(
      `CRITICAL SAFETY VIOLATION: Forbidden private field '${field}' is present in RESTORABLE_FIELDS list.`
    );
  }
}

const BATCH_LIMIT = 200;

export function validateSnapshotStructure(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("Invalid snapshot: Root must be a non-null object.");
  }

  if (!snapshot.users || typeof snapshot.users !== "object" || Array.isArray(snapshot.users)) {
    throw new Error("Invalid snapshot: Missing or malformed 'users' dictionary.");
  }

  for (const [uid, record] of Object.entries(snapshot.users)) {
    if (!uid || typeof uid !== "string") {
      throw new Error(`Invalid snapshot: Malformed user UID key: '${uid}'`);
    }

    if (!record || typeof record !== "object") {
      throw new Error(`Invalid snapshot: Record for user '${uid}' must be an object.`);
    }

    if (!record.profileFields || typeof record.profileFields !== "object" || Array.isArray(record.profileFields)) {
      throw new Error(`Invalid snapshot: Malformed 'profileFields' for user '${uid}'.`);
    }

    const { profileFields } = record;

    if (profileFields.displayName !== undefined && typeof profileFields.displayName !== "string") {
      throw new Error(`Invalid snapshot: displayName for user '${uid}' must be a string.`);
    }

    if (
      profileFields.photoURL !== undefined &&
      profileFields.photoURL !== null &&
      typeof profileFields.photoURL !== "string"
    ) {
      throw new Error(`Invalid snapshot: photoURL for user '${uid}' must be a string or null.`);
    }

    if (profileFields.bio !== undefined && typeof profileFields.bio !== "string") {
      throw new Error(`Invalid snapshot: bio for user '${uid}' must be a string.`);
    }

    if (profileFields.department !== undefined && typeof profileFields.department !== "string") {
      throw new Error(`Invalid snapshot: department for user '${uid}' must be a string.`);
    }

    if (profileFields.year !== undefined && typeof profileFields.year !== "string") {
      throw new Error(`Invalid snapshot: year for user '${uid}' must be a string.`);
    }

    if (profileFields.skills !== undefined && !Array.isArray(profileFields.skills)) {
      throw new Error(`Invalid snapshot: skills for user '${uid}' must be an array.`);
    }

    if (
      profileFields.socialLinks !== undefined &&
      (typeof profileFields.socialLinks !== "object" || profileFields.socialLinks === null || Array.isArray(profileFields.socialLinks))
    ) {
      throw new Error(`Invalid snapshot: socialLinks for user '${uid}' must be an object.`);
    }

    if (record.metadata !== undefined) {
      if (typeof record.metadata !== "object" || record.metadata === null || Array.isArray(record.metadata)) {
        throw new Error(`Invalid snapshot: metadata for user '${uid}' must be an object.`);
      }
      if (record.metadata.isDemoPresent !== undefined && typeof record.metadata.isDemoPresent !== "boolean") {
        throw new Error(`Invalid snapshot: isDemoPresent for user '${uid}' must be a boolean.`);
      }
      if (record.metadata.isDemo !== undefined && typeof record.metadata.isDemo !== "boolean") {
        throw new Error(`Invalid snapshot: isDemo for user '${uid}' must be a boolean.`);
      }
      if (record.metadata.isDemoPresent === true && typeof record.metadata.isDemo !== "boolean") {
        throw new Error(
          `Invalid snapshot: isDemo must be explicitly present and boolean when isDemoPresent is true for user '${uid}'.`
        );
      }
    }
  }

  return true;
}

export function constructRestorePayload(userRecord) {
  const payload = {};
  const { profileFields = {}, metadata = {} } = userRecord;

  for (const field of RESTORABLE_FIELDS) {
    if (field === "isDemo") {
      if (metadata.isDemoPresent === true) {
        payload.isDemo = Boolean(metadata.isDemo);
      } else if (metadata.isDemoPresent === undefined && (metadata.isDemo === true || profileFields.isDemo === true)) {
        // Backward-compatible fallback for older snapshots: only restore if explicitly true
        payload.isDemo = true;
      }
      // If isDemoPresent === false, do NOT write isDemo (preserves field absence)
    } else if (profileFields[field] !== undefined) {
      payload[field] = profileFields[field];
    }
  }

  // Safety Assertion: Verify no forbidden private field is in the constructed payload
  for (const key of Object.keys(payload)) {
    if (FORBIDDEN_PRIVATE_FIELDS.includes(key)) {
      throw new Error(`CRITICAL INVARIANT BREACH: Attempted to construct restore payload with private field '${key}'`);
    }
  }

  return payload;
}

export async function restoreLegacyFields(snapshotPath, options = {}) {
  const isDryRun = options.dryRun ?? false;
  const db = options.db ?? getAdminDb();

  console.log(`[restoreLegacyFields] Starting restoration from snapshot: ${snapshotPath}`);
  console.log(`[restoreLegacyFields] Execution Mode: ${isDryRun ? "DRY RUN (Zero writes)" : "LIVE WRITES"}`);

  if (!fs.existsSync(snapshotPath)) {
    throw new Error(`Snapshot file does not exist at: ${snapshotPath}`);
  }

  const rawContent = fs.readFileSync(snapshotPath, "utf-8");
  let snapshot;
  try {
    snapshot = JSON.parse(rawContent);
  } catch (err) {
    throw new Error(`Failed to parse snapshot JSON: ${err.message}`);
  }

  validateSnapshotStructure(snapshot);

  const uids = Object.keys(snapshot.users);
  console.log(`[restoreLegacyFields] Validated snapshot containing ${uids.length} user records.`);

  let usersRestored = 0;
  let fieldsRestoredTotal = 0;
  let currentBatch = db.batch();
  let opCount = 0;

  for (const uid of uids) {
    const userRecord = snapshot.users[uid];
    const restorePayload = constructRestorePayload(userRecord);
    const fieldCount = Object.keys(restorePayload).length;

    if (fieldCount > 0) {
      usersRestored++;
      fieldsRestoredTotal += fieldCount;

      if (!isDryRun) {
        const userRef = db.collection("users").doc(uid);
        currentBatch.update(userRef, restorePayload);
        opCount++;

        if (opCount >= BATCH_LIMIT) {
          await currentBatch.commit();
          console.log(`[restoreLegacyFields] Committed batch of ${opCount} user restorations.`);
          currentBatch = db.batch();
          opCount = 0;
        }
      }
    }
  }

  if (opCount > 0 && !isDryRun) {
    await currentBatch.commit();
    console.log(`[restoreLegacyFields] Committed final batch of ${opCount} user restorations.`);
  }

  console.log("\n==================================================");
  console.log(`[restoreLegacyFields] Restoration Summary:`);
  console.log(`- Snapshot file:             ${snapshotPath}`);
  console.log(`- Total users in snapshot:   ${uids.length}`);
  console.log(`- Users processed/restored:  ${usersRestored}`);
  console.log(`- Total fields restored:     ${fieldsRestoredTotal}`);
  console.log(`- Private fields written:    0 (Strict invariant enforced)`);
  console.log(`- Mode:                      ${isDryRun ? "DRY RUN (Zero writes)" : "LIVE (Updates committed)"}`);
  console.log("==================================================\n");

  return {
    totalUsersInSnapshot: uids.length,
    usersRestored,
    fieldsRestoredTotal,
    isDryRun,
  };
}

// CLI Execution Entry Point
const isCli = process.argv[1] && (
  path.resolve(process.argv[1]) === __filename ||
  process.argv[1].endsWith("restoreLegacyFields.mjs")
);

if (isCli) {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const fileArgs = args.filter((a) => !a.startsWith("--"));

  if (fileArgs.length === 0) {
    console.error("Usage: node scripts/restoreLegacyFields.mjs <snapshot.json> [--dry-run]");
    process.exit(1);
  }

  const snapshotPath = path.resolve(fileArgs[0]);
  restoreLegacyFields(snapshotPath, { dryRun: isDryRun })
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error("[restoreLegacyFields] Fatal error during restoration:", err.message);
      process.exit(1);
    });
}
