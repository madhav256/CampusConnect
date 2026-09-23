/**
 * Milestone 14B — Public Profiles & Directory Index Migration Script
 *
 * Responsibilities:
 * - Read current users collection
 * - Create/update publicProfiles with the 8-field strict schema (no timestamps)
 * - Create/update directoryIndex for discoverable users (seeding updatedAt from users.updatedAt)
 * - Preserve current authoritative values
 * - Safe batching (max 200 writes per batch)
 * - Idempotent execution
 * - Dry-run support (--dry-run flag)
 * - Zero deletion of legacy fields
 */

import { getAdminDb, FieldValue } from "./adminClient.mjs";

const BATCH_LIMIT = 200;

async function runMigration() {
  const isDryRun = process.argv.includes("--dry-run");
  console.log(`[migratePublicProfiles] Starting migration... ${isDryRun ? "(DRY RUN MODE)" : "(LIVE WRITES)"}`);

  const db = getAdminDb();
  const usersSnapshot = await db.collection("users").get();

  console.log(`[migratePublicProfiles] Found ${usersSnapshot.size} total user documents to process.`);

  let publicProfilesCreated = 0;
  let directoryIndexCreated = 0;
  let skippedNonDiscoverable = 0;

  let currentBatch = db.batch();
  let opCount = 0;

  for (const userDoc of usersSnapshot.docs) {
    const uid = userDoc.id;
    const data = userDoc.data();

    // 1. Construct publicProfiles payload (strictly 8 fields, no timestamps)
    const publicProfile = {
      uid,
      displayName: typeof data.displayName === "string" ? data.displayName : "CampusConnect Student",
      photoURL: data.photoURL || null,
      bio: typeof data.bio === "string" ? data.bio : "",
      department: typeof data.department === "string" ? data.department : "Department not added",
      year: typeof data.year === "string" ? data.year : "Academic year not added",
      skills: Array.isArray(data.skills) ? data.skills : [],
      socialLinks: {
        github: data.socialLinks?.github || "",
        linkedin: data.socialLinks?.linkedin || "",
        portfolio: data.socialLinks?.portfolio || "",
        website: data.socialLinks?.website || "",
      },
    };

    const pubRef = db.collection("publicProfiles").doc(uid);
    if (!isDryRun) {
      currentBatch.set(pubRef, publicProfile, { merge: true });
    }
    publicProfilesCreated++;
    opCount++;

    if (opCount >= BATCH_LIMIT) {
      if (!isDryRun) {
        await currentBatch.commit();
        console.log(`[migratePublicProfiles] Committed batch of ${opCount} operations.`);
      }
      currentBatch = db.batch();
      opCount = 0;
    }

    // 2. Construct directoryIndex payload if user is discoverable
    const isDiscoverable = data.isDiscoverable !== false;
    if (isDiscoverable) {
      const directoryDoc = {
        uid,
        displayName: publicProfile.displayName,
        photoURL: publicProfile.photoURL,
        department: publicProfile.department,
        year: publicProfile.year,
        skills: publicProfile.skills,
        updatedAt: data.updatedAt || FieldValue.serverTimestamp(),
      };

      const dirRef = db.collection("directoryIndex").doc(uid);
      if (!isDryRun) {
        currentBatch.set(dirRef, directoryDoc, { merge: true });
      }
      directoryIndexCreated++;
      opCount++;

      if (opCount >= BATCH_LIMIT) {
        if (!isDryRun) {
          await currentBatch.commit();
          console.log(`[migratePublicProfiles] Committed batch of ${opCount} operations.`);
        }
        currentBatch = db.batch();
        opCount = 0;
      }
    } else {
      skippedNonDiscoverable++;
    }
  }

  // Commit any trailing batch operations
  if (opCount > 0 && !isDryRun) {
    await currentBatch.commit();
    console.log(`[migratePublicProfiles] Committed final batch of ${opCount} operations.`);
  }

  console.log("\n==================================================");
  console.log(`[migratePublicProfiles] Migration complete! Summary:`);
  console.log(`- Users scanned:               ${usersSnapshot.size}`);
  console.log(`- publicProfiles processed:    ${publicProfilesCreated}`);
  console.log(`- directoryIndex processed:    ${directoryIndexCreated}`);
  console.log(`- Non-discoverable skipped:    ${skippedNonDiscoverable}`);
  console.log(`- Mode:                        ${isDryRun ? "DRY RUN (no writes performed)" : "LIVE (writes committed)"}`);
  console.log("==================================================\n");
}

runMigration().catch((err) => {
  console.error("[migratePublicProfiles] Fatal migration error:", err);
  process.exit(1);
});
