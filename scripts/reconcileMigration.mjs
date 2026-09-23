/**
 * Milestone 14B — Final Reconciliation Script
 *
 * Responsibilities:
 * - Authority model:
 *     publicProfiles/{uid}       = SOLE authority for public profile fields
 *     users/{uid}.isDiscoverable = SOLE authority for discoverability
 *     directoryIndex/{uid}       = derived projection
 *     users legacy fields        = ZERO authority (never promoted or merged)
 * - Detects missing publicProfiles anomalies (terminates non-zero, blocks cleanup)
 * - Reports divergence between users legacy residue and authoritative publicProfiles
 * - Repairs directoryIndex from authoritative publicProfiles
 * - Deletes stale directoryIndex entries for non-discoverable users
 * - Dry-run support (--dry-run)
 */

import { getAdminDb, FieldValue } from "./adminClient.mjs";

const BATCH_LIMIT = 200;

async function reconcile() {
  const isDryRun = process.argv.includes("--dry-run");
  console.log(`[reconcileMigration] Starting final reconciliation... ${isDryRun ? "(DRY RUN MODE)" : "(LIVE REPAIRS)"}`);

  const db = getAdminDb();

  const [usersSnap, publicSnap, dirSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("publicProfiles").get(),
    db.collection("directoryIndex").get(),
  ]);

  console.log(`[reconcileMigration] Retrieved collections:`);
  console.log(`  users:           ${usersSnap.size}`);
  console.log(`  publicProfiles:  ${publicSnap.size}`);
  console.log(`  directoryIndex:  ${dirSnap.size}`);

  const publicMap = new Map();
  for (const doc of publicSnap.docs) {
    publicMap.set(doc.id, doc.data());
  }

  const dirMap = new Map();
  for (const doc of dirSnap.docs) {
    dirMap.set(doc.id, doc.data());
  }

  // 1. INVARIANT CHECK: If users/{uid} exists, publicProfiles/{uid} MUST exist.
  // Never reconstruct publicProfiles from legacy users residue.
  const missingPublicProfiles = [];
  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    if (!publicMap.has(uid)) {
      missingPublicProfiles.push(uid);
    }
  }

  if (missingPublicProfiles.length > 0) {
    console.error("\n================================================================================");
    console.error("CRITICAL DATA INTEGRATION ANOMALY ENCOUNTERED:");
    console.error("--------------------------------------------------------------------------------");
    console.error(
      `Found ${missingPublicProfiles.length} users with existing users/{uid} but MISSING publicProfiles/{uid}:`
    );
    for (const uid of missingPublicProfiles) {
      console.error(`  - Missing publicProfiles/${uid}`);
    }
    console.error("");
    console.error("ARCHITECTURAL INVARIANT VIOLATION:");
    console.error("publicProfiles cannot be reconstructed from legacy users residue.");
    console.error("Reconciliation is terminating with non-zero exit code to BLOCK Cleanup.");
    console.error("================================================================================\n");
    process.exit(1);
  }

  // 2. AUDIT DIVERGENCE: Compare legacy users residue against authoritative publicProfiles
  let divergenceCount = 0;
  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const userData = userDoc.data();
    const pubData = publicMap.get(uid);

    const legacyFields = ["displayName", "photoURL", "bio", "department", "year"];
    const diverging = [];
    for (const field of legacyFields) {
      if (userData[field] !== undefined && userData[field] !== pubData[field]) {
        diverging.push({
          field,
          authoritative: pubData[field],
          legacyResidue: userData[field],
        });
      }
    }

    if (diverging.length > 0) {
      divergenceCount++;
      console.log(`[reconcileMigration] Info: Divergence detected for user ${uid} (publicProfiles authoritative wins):`);
      for (const d of diverging) {
        console.log(`    ${d.field}: publicProfiles='${d.authoritative}' vs legacy='${d.legacyResidue}'`);
      }
    }
  }

  // 3. REPAIR DIRECTORY INDEX PROJECTIONS
  let repairedIndexes = 0;
  let deletedStaleIndexes = 0;
  let verifiedMatches = 0;

  let currentBatch = db.batch();
  let opCount = 0;

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const isDiscoverable = userDoc.data().isDiscoverable !== false;
    const pubData = publicMap.get(uid);
    const existingDir = dirMap.get(uid);

    if (isDiscoverable) {
      // Must exist in directoryIndex and match projection
      const expectedProjection = {
        uid,
        displayName: pubData.displayName || "CampusConnect Student",
        photoURL: pubData.photoURL || null,
        department: pubData.department || "Department not added",
        year: pubData.year || "Academic year not added",
        skills: Array.isArray(pubData.skills) ? pubData.skills : [],
      };

      const needsRepair =
        !existingDir ||
        existingDir.displayName !== expectedProjection.displayName ||
        existingDir.photoURL !== expectedProjection.photoURL ||
        existingDir.department !== expectedProjection.department ||
        existingDir.year !== expectedProjection.year ||
        JSON.stringify(existingDir.skills || []) !== JSON.stringify(expectedProjection.skills);

      if (needsRepair) {
        repairedIndexes++;
        if (!isDryRun) {
          const dirRef = db.collection("directoryIndex").doc(uid);
          currentBatch.set(
            dirRef,
            {
              ...expectedProjection,
              updatedAt: existingDir?.updatedAt || FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          opCount++;
        }
      } else {
        verifiedMatches++;
      }
    } else {
      // Must NOT exist in directoryIndex
      if (existingDir) {
        deletedStaleIndexes++;
        if (!isDryRun) {
          const dirRef = db.collection("directoryIndex").doc(uid);
          currentBatch.delete(dirRef);
          opCount++;
        }
      }
    }

    if (opCount >= BATCH_LIMIT) {
      if (!isDryRun) {
        await currentBatch.commit();
        console.log(`[reconcileMigration] Committed repair batch of ${opCount} operations.`);
      }
      currentBatch = db.batch();
      opCount = 0;
    }
  }

  // Also check if any orphan directoryIndex documents exist with no corresponding user
  for (const dirDoc of dirSnap.docs) {
    const uid = dirDoc.id;
    if (!publicMap.has(uid)) {
      deletedStaleIndexes++;
      if (!isDryRun) {
        currentBatch.delete(dirDoc.ref);
        opCount++;
      }
      if (opCount >= BATCH_LIMIT) {
        if (!isDryRun) {
          await currentBatch.commit();
        }
        currentBatch = db.batch();
        opCount = 0;
      }
    }
  }

  if (opCount > 0 && !isDryRun) {
    await currentBatch.commit();
    console.log(`[reconcileMigration] Committed final repair batch of ${opCount} operations.`);
  }

  console.log("\n==================================================");
  console.log(`[reconcileMigration] Reconciliation Summary:`);
  console.log(`- Total users evaluated:            ${usersSnap.size}`);
  console.log(`- Missing publicProfiles anomalies: 0 (PASSED)`);
  console.log(`- Residue divergences reported:     ${divergenceCount}`);
  console.log(`- directoryIndex verified matching: ${verifiedMatches}`);
  console.log(`- directoryIndex repaired:          ${repairedIndexes}`);
  console.log(`- directoryIndex stale deleted:     ${deletedStaleIndexes}`);
  console.log(`- Mode:                             ${isDryRun ? "DRY RUN (no writes performed)" : "LIVE (repairs committed)"}`);
  console.log("==================================================\n");
}

reconcile().catch((err) => {
  console.error("[reconcileMigration] Fatal error during reconciliation:", err);
  process.exit(1);
});
