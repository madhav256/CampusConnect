/**
 * Milestone 14B — Legacy Snapshot Diff Script
 *
 * Responsibilities:
 * - Genuine field-by-field comparison between two snapshots
 * - Outputs detail for every diff: uid, changedFields[], before, after
 * - Semantic comparison:
 *     - Canonicalize socialLinks object key ordering
 *     - Array comparison for skills
 * - Documents the fundamental limitations of net-observable state snapshots
 *
 * Usage:
 *   node scripts/diffLegacySnapshots.mjs [snapshotA.json] [snapshotB.json]
 *   (If omitted, diffs the two most recent snapshots in scripts/snapshots/)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LEGACY_PROFILE_FIELDS } from "./snapshotLegacyFields.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function canonicalizeValue(field, value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (field === "socialLinks" && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = value[key] ?? "";
    }
    return sorted;
  }
  if (field === "skills" && Array.isArray(value)) {
    return [...value].map((s) => String(s).trim()).sort();
  }
  return value;
}

function areValuesSemanticallyEqual(field, valA, valB) {
  const canonA = canonicalizeValue(field, valA);
  const canonB = canonicalizeValue(field, valB);
  return JSON.stringify(canonA) === JSON.stringify(canonB);
}

function printDocumentedLimitations() {
  console.log("\n================================================================================");
  console.log("DOCUMENTED ARCHITECTURAL LIMITATION OF SNAPSHOT / DIFF:");
  console.log("--------------------------------------------------------------------------------");
  console.log("Snapshot/diff detects NET observable state differences between two time points.");
  console.log("It is NOT an append-only audit log.");
  console.log("");
  console.log("Example scenario:");
  console.log("  1. Baseline snapshot:       department = CSE");
  console.log("  2. Stale old client write:  department = IT");
  console.log("  3. Stale old client write:  department = CSE");
  console.log("  4. Second snapshot:         department = CSE");
  console.log("  Result: Net difference = 0 (No mutation detected).");
  console.log("");
  console.log("Therefore:");
  console.log("- snapshot/diff does NOT prove zero historical writes occurred.");
  console.log("- snapshot/diff does NOT prove zero stale clients exist in the wild.");
  console.log("- 48 hours of quiescence does NOT prove zero stale clients.");
  console.log("The Intermediate Rules Gate is the hard security boundary that guarantees privacy.");
  console.log("================================================================================\n");
}

function resolveSnapshotFiles() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (args.length >= 2) {
    return [path.resolve(args[0]), path.resolve(args[1])];
  }

  const snapshotsDir = path.join(__dirname, "snapshots");
  if (!fs.existsSync(snapshotsDir)) {
    throw new Error(`Snapshots directory does not exist at: ${snapshotsDir}`);
  }

  const files = fs
    .readdirSync(snapshotsDir)
    .filter((f) => f.startsWith("legacy_snapshot_") && f.endsWith(".json"))
    .map((f) => path.join(snapshotsDir, f))
    .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);

  if (files.length < 2) {
    throw new Error(
      `Need at least 2 snapshot files to diff. Found ${files.length} in ${snapshotsDir}. Specify paths manually.`
    );
  }

  return [files[files.length - 2], files[files.length - 1]];
}

function diffSnapshots() {
  printDocumentedLimitations();

  const [pathA, pathB] = resolveSnapshotFiles();
  console.log(`[diffLegacySnapshots] Comparing snapshots:`);
  console.log(`  Before: ${pathA}`);
  console.log(`  After:  ${pathB}\n`);

  const snapshotA = JSON.parse(fs.readFileSync(pathA, "utf-8"));
  const snapshotB = JSON.parse(fs.readFileSync(pathB, "utf-8"));

  const allUids = new Set([
    ...Object.keys(snapshotA.users || {}),
    ...Object.keys(snapshotB.users || {}),
  ]);

  const diffs = [];

  for (const uid of allUids) {
    const userA = snapshotA.users?.[uid]?.profileFields || {};
    const userB = snapshotB.users?.[uid]?.profileFields || {};

    const changedFields = [];
    const beforeValues = {};
    const afterValues = {};

    for (const field of LEGACY_PROFILE_FIELDS) {
      const valA = userA[field];
      const valB = userB[field];

      if (!areValuesSemanticallyEqual(field, valA, valB)) {
        changedFields.push(field);
        beforeValues[field] = valA ?? null;
        afterValues[field] = valB ?? null;
      }
    }

    if (changedFields.length > 0) {
      diffs.push({
        uid,
        changedFields,
        before: beforeValues,
        after: afterValues,
      });
    }
  }

  console.log(`[diffLegacySnapshots] Total users evaluated: ${allUids.size}`);
  console.log(`[diffLegacySnapshots] Users with legacy mutations detected: ${diffs.length}`);

  if (diffs.length === 0) {
    console.log(`\n✓ SUCCESS: Zero net legacy mutations observed between snapshots.`);
  } else {
    console.warn(`\n⚠ WARNING: Legacy profile mutations detected across snapshots:`);
    console.log(JSON.stringify(diffs, null, 2));
  }

  return diffs;
}

try {
  diffSnapshots();
} catch (err) {
  console.error("[diffLegacySnapshots] Fatal error:", err.message);
  process.exit(1);
}
