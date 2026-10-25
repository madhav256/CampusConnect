import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, getApps, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

export const PRODUCTION_PROJECT_ID = "campusconnect-cf191";
export const DEFAULT_EMULATOR_PROJECT_ID = "demo-campusconnect-rules-test";

export function isDeployedFunctionsRuntime(env = process.env) {
  if (env.FIRESTORE_EMULATOR_HOST || env.FUNCTIONS_EMULATOR === "true" || env.VITEST) {
    return false;
  }
  return Boolean(env.K_SERVICE || env.FUNCTION_TARGET || env.FUNCTION_NAME);
}

export function loadLocalEnv() {
  const envFiles = [".env.local", ".env"];
  for (const file of envFiles) {
    const fullPath = path.join(projectRoot, file);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if (
              (val.startsWith('"') && val.endsWith('"')) ||
              (val.startsWith("'") && val.endsWith("'"))
            ) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      } catch (err) {
        console.warn(`[adminClient] Note: could not parse ${file}:`, err.message);
      }
    }
  }
}

export function getAdminApp() {
  const existingApps = getApps();
  if (existingApps.length > 0) {
    return existingApps[0];
  }

  // 1. Local Firestore Emulator Mode
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    for (const variable of ["TEST_PROJECT_ID", "GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"]) {
      if (process.env[variable] === PRODUCTION_PROJECT_ID) {
        throw new Error(
          `[adminClient] FAIL-CLOSED GUARD: Refusing to initialize emulator Admin client with production project ID "${PRODUCTION_PROJECT_ID}" (${variable}).`
        );
      }
    }

    const emulatorProjectId =
      process.env.TEST_PROJECT_ID ||
      process.env.GCLOUD_PROJECT ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      DEFAULT_EMULATOR_PROJECT_ID;

    return initializeApp({
      projectId: emulatorProjectId,
    });
  }

  // 2. Deployed Cloud Functions / Cloud Run Runtime (preserve ADC behavior)
  if (isDeployedFunctionsRuntime(process.env)) {
    const runtimeProjectId =
      process.env.GCLOUD_PROJECT ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      PRODUCTION_PROJECT_ID;

    return initializeApp({
      credential: applicationDefault(),
      projectId: runtimeProjectId,
    });
  }

  // 3. Local Non-Emulator Execution: Fail closed unless explicit production opt-in is set
  if (process.env.ALLOW_PRODUCTION_ADMIN_ACCESS !== "true") {
    throw new Error(
      "[adminClient] FAIL-CLOSED GUARD: Refusing to initialize Firebase Admin without FIRESTORE_EMULATOR_HOST. " +
        "Local tests and ordinary scripts must run against the Firestore Emulator (set FIRESTORE_EMULATOR_HOST). " +
        "To intentionally run an administrative script against real cloud resources, set ALLOW_PRODUCTION_ADMIN_ACCESS=true."
    );
  }

  loadLocalEnv();

  const projectId =
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    PRODUCTION_PROJECT_ID;

  console.warn(
    `⚠️ [WARNING][adminClient] Explicit real-cloud opt-in (ALLOW_PRODUCTION_ADMIN_ACCESS=true) detected. ` +
      `Initializing Firebase Admin SDK against live cloud project "${projectId}".`
  );

  const serviceAccountKeyPath = path.join(__dirname, "credentials", "serviceAccountKey.json");
  if (fs.existsSync(serviceAccountKeyPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountKeyPath, "utf-8"));
    return initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id || projectId,
    });
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    return initializeApp({
      credential: applicationDefault(),
      projectId,
    });
  }

  return initializeApp({
    credential: applicationDefault(),
    projectId,
  });
}

export function getAdminDb() {
  const app = getAdminApp();
  return getFirestore(app);
}

export { FieldValue, Timestamp };
