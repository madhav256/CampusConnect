/**
 * Milestone 14B — Legacy Snapshot Script
 *
 * Responsibilities:
 * - Scans all documents in users collection
 * - Tracks legacy PUBLIC PROFILE fields individually:
 *     displayName, photoURL, bio, department, year, skills, socialLinks
 * - Does NOT use aggregate hashes as the only evidence (stores actual field values)
 * - Separates LEGACY_PROFILE_FIELDS from isDemo metadata
 * - Writes snapshot to disk for subsequent field-by-field diff comparison
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAdminDb } from "./adminClient.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const LEGACY_PROFILE_FIELDS = [
  "displayName",
  "photoURL",
  "bio",
  "department",
  "year",
  "skills",
  "socialLinks",
];

async function captureSnapshot() {
  console.log("[snapshotLegacyFields] Capturing legacy profile snapshot from users collection...");

  const db = getAdminDb();
  const usersSnapshot = await db.collection("users").get();

  const snapshotData = {
    timestamp: new Date().toISOString(),
    userCount: usersSnapshot.size,
    fieldsTracked: LEGACY_PROFILE_FIELDS,
    users: {},
  };

  for (const userDoc of usersSnapshot.docs) {
    const uid = userDoc.id;
    const data = userDoc.data();

    const profileFields = {};
    for (const field of LEGACY_PROFILE_FIELDS) {
      if (data[field] !== undefined) {
        profileFields[field] = data[field];
      }
    }

    snapshotData.users[uid] = {
      profileFields,
      // isDemo is migration/demo metadata, separated from profile fields
      metadata: {
        isDemo: Boolean(data.isDemo),
      },
    };
  }

  // Parse optional output path from --out <filepath>
  const outArgIdx = process.argv.indexOf("--out");
  let outputPath;
  if (outArgIdx !== -1 && process.argv[outArgIdx + 1]) {
    outputPath = path.resolve(process.argv[outArgIdx + 1]);
  } else {
    const snapshotsDir = path.join(__dirname, "snapshots");
    if (!fs.existsSync(snapshotsDir)) {
      fs.mkdirSync(snapshotsDir, { recursive: true });
    }
    const filename = `legacy_snapshot_${Date.now()}.json`;
    outputPath = path.join(snapshotsDir, filename);
  }

  fs.writeFileSync(outputPath, JSON.stringify(snapshotData, null, 2), "utf-8");

  console.log(`[snapshotLegacyFields] Snapshot successfully captured for ${usersSnapshot.size} users.`);
  console.log(`[snapshotLegacyFields] Saved to: ${outputPath}`);
}

const isMain = process.argv[1] && (
  path.resolve(process.argv[1]) === __filename ||
  process.argv[1].endsWith("snapshotLegacyFields.mjs")
);

if (isMain) {
  captureSnapshot().catch((err) => {
    console.error("[snapshotLegacyFields] Fatal error capturing snapshot:", err);
    process.exit(1);
  });
}
