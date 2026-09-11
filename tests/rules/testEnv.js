/* global process */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";

export const TEST_PROJECT_ID = "demo-campusconnect-rules-test";
const PRODUCTION_PROJECT_ID = "campusconnect-cf191";
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rulesPath = path.join(projectRoot, "firestore.rules");

function assertEmulatorOnlyEnvironment() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      "Rules tests require FIRESTORE_EMULATOR_HOST. Run them through the Firestore emulator."
    );
  }

  for (const variable of ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"]) {
    if (process.env[variable] === PRODUCTION_PROJECT_ID) {
      throw new Error(`Rules tests refuse to target production project ${PRODUCTION_PROJECT_ID}.`);
    }
  }

  if (process.env.FIREBASE_CONFIG?.includes(PRODUCTION_PROJECT_ID)) {
    throw new Error("Rules tests refuse a production FIREBASE_CONFIG value.");
  }
}

assertEmulatorOnlyEnvironment();

export const testEnvironment = await initializeTestEnvironment({
  projectId: TEST_PROJECT_ID,
  firestore: {
    rules: fs.readFileSync(rulesPath, "utf8"),
  },
});

export async function resetFirestore() {
  await testEnvironment.clearFirestore();
}

export async function closeTestEnvironment() {
  await testEnvironment.cleanup();
}
