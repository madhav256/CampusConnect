# CampusConnect — Local-First Development and Zero-Cost Operating Guide (Option A)

**Document Status:** Active Operating Guide
**Architecture Contract:** Preserves [ADR-024 Revision 33](file:///c:/Users/MADHAV/campus-connect/docs/architecture/decisions/ADR-024.md)
**Cloud Architecture Relationship:** Complements [ADR-025.md](file:///c:/Users/MADHAV/campus-connect/ADR-025.md) (Status: `PROPOSED — PENDING EXPLICIT APPROVAL`). Under Option A, the production Firebase project exists, but the Milestone 24.3 backend (Cloud Functions v2, Cloud Tasks, Cloud Scheduler) remains intentionally undeployed to Google Cloud, preserving the Firebase Spark plan at strict ₹0 operating cost. All Milestone 24.3 domain features are developed, tested, and demonstrated locally using the Firebase Emulator Suite and Vite.

---

## 1. Operating Overview & Zero-Cost Mandate

Under Option A:
- **Operating Budget:** Strict ₹0. No Google Cloud billing account is linked, and Firebase remains on the Spark plan (Blaze-avoidance mandate).
- **Backend Deployment Status:** The live production Firebase project (`campusconnect-cf191`) exists, but the Milestone 24.3 backend has **not been deployed**. Never seed, run migrations, or execute development tests against `campusconnect-cf191`.
- **Local Emulation:** Full backend and frontend functionality—including capped-event capacity coordination, FIFO waitlists, automatic promotion upon cancellation, and seat claiming—runs locally using the official Firebase Emulator Suite and Vite.
- **Option B Status:** The isolated Cloudflare Worker PoC (`experiments/cloudflare-worker-poc/`) remains preserved for future evaluation. Revisiting Option B requires a separate explicit architectural decision.

---

## 2. Prerequisites & Verified Toolchain Versions

Ensure the following runtimes and command-line tools are installed:

| Tool | Verified Version | Purpose |
| :--- | :--- | :--- |
| **Node.js** | `v22.19.0` (Engine: `>= 22`) | Host runtime for frontend, Admin SDK scripts, and Functions |
| **npm** | `11.11.0` | Package management and script orchestration |
| **Java (JRE/JDK)** | `21` (Build `21+35-LTS`) | Required to run Cloud Firestore Local Emulator jar |
| **Firebase CLI** | `firebase-tools@15.30.0` | Manages local Auth, Firestore, and Functions emulators |
| **Playwright** | `@playwright/test@1.63.0` | End-to-end browser automation and demo journeys |
| **Vitest** | `vitest@5.0.0` | Unit, Rules, and Functions boundary test execution |

---

## 3. Network Architecture: Intended Ports & Project Identifiers

### Project Identity & Isolation Boundaries
- **Dedicated Local Demo Project:** **`demo-campusconnect-rules-test`**
  *Accurate Emulator Behavior:* In Firebase tools, project IDs prefixed with `demo-` signal to the emulator suite that interactions with products covered by running emulators (Authentication, Firestore, Functions) must remain local. Attempts by emulated client SDKs to contact non-emulated Firebase cloud services for that project will fail-closed. This configuration guarantees that Firebase SDK calls target local emulators, though it does not act as a general network firewall against arbitrary external HTTP requests initiated by custom Node scripts.
- **Production Project (Undeployed):** **`campusconnect-cf191`**
  *Rule:* This is the existing production Firebase project. Never target `campusconnect-cf191` during local development, test execution, database seeding, or schema migrations. Administrative scripts and state helpers contain fail-closed guards that throw fatal errors if `campusconnect-cf191` is passed in an emulator context.

### Intended Local Ports
- **Cloud Firestore Emulator:** `8080` (Configured in `firebase.json`)
- **Firebase Authentication Emulator:** `9099` (Configured in `firebase.json`)
- **Cloud Functions (v2) Emulator:** `5001` (Configured in `firebase.json`)
- **Firestore Emulator UI WebSocket:** `9150`
- **Vite Frontend Dev Server:** `5173` (Configured in `playwright.config.js`)

---

## 4. Starting the Local Development Environment

To run the complete interactive local application, open three terminal windows in the project root:

### Terminal 1: Start the Required Firebase Emulators
Run all three required emulators (`firestore`, `auth`, `functions`):
```bash
npx firebase emulators:start --project demo-campusconnect-rules-test --only firestore,auth,functions
```
*Note:* Do not use `npm run emulators` for full M24.3 development because that legacy script only launches `firestore,auth`. The Functions emulator on port `5001` is strictly required to execute M24.3 HTTPS callable handlers (`cancelRsvpWithPromotion`, `claimWaitlistOffer`, `declineWaitlistOffer`, etc.).

### Terminal 2: Seed Deterministic Local Demonstration Data
Once the emulators are running (wait for `All emulators ready!`), seed the local database:
```bash
node scripts/seedE2E.mjs
```
This populates deterministic test fixtures into the local emulators:
- **Campuses:** Apex Institute of Technology (`apex-university`) & St. Jude University (`st-jude-university`).
- **Communities:** Apex AI & Robotics Society (`apex-ai-club`), Design Collective, and Medical Society.
- **Community Memberships:** Alice Chen (`e2e-student-a`) as Admin; Bob Smith (`e2e-student-b`) as Member.
- **Events & RSVPs:** Active multi-tenant campus events.
- **Disposable Emulator Auth Accounts:** Local mock test accounts with non-secret, disposable passwords created exclusively in the local Authentication emulator (e.g., Alice Chen: `e2e.student.a@campusconnect.test`, Bob Smith: `e2e.student.b@campusconnect.test`).

### Terminal 3: Start the Vite Frontend in Emulator Mode
Launch the Vite development server using the dedicated E2E emulator configuration:
```bash
npm run dev -- --mode e2e --port 5173
```
*Why `--mode e2e` is essential:* Default `npm run dev` loads `.env.local` where `VITE_USE_FIREBASE_EMULATOR=false`. Passing `--mode e2e` instructs Vite to load `.env.e2e`, setting `VITE_USE_FIREBASE_EMULATOR=true`, which configures `src/firebase/config.js` to connect to `localhost:8080`, `localhost:9099`, and `localhost:5001`.

Open `http://localhost:5173` in your browser.

---

## 5. How to Recognize that the Application is Using Emulators

Verify that the local frontend is isolated from production:
1. **Browser DevTools Console:** Upon loading `http://localhost:5173`, confirm that no errors appear and that Firebase initializes without referencing production endpoints.
2. **Network Tab Inspection:**
   - Authentication requests target `http://localhost:9099/identitytoolkit.googleapis.com/...`
   - Firestore queries target `http://localhost:8080/google.firestore.v1.Firestore/...`
   - Function calls target `http://localhost:5001/demo-campusconnect-rules-test/us-central1/...`
   - **Zero** network requests are sent to `campusconnect-cf191.firebaseapp.com` or `firestore.googleapis.com`.
3. **Emulator Terminal Logs:** Terminal 1 will log incoming requests (e.g. `Beginning execution of "us-central1-cancelRsvpWithPromotion"`).

---

## 6. Demonstration Workflows

### A. Automated Capped-Event & Waitlist Demonstration (One Command)
To demonstrate the complete M24.3 capped-event lifecycle automatically in headless Chromium:
```bash
npx firebase emulators:exec --project demo-campusconnect-rules-test --only firestore,auth,functions "node scripts/seedE2E.mjs && npx playwright test tests/e2e/eventRsvps.spec.js -g Capped-event"
```
This automated journey proves:
1. Creating a capped event with capacity 1.
2. Student A RSVPs, filling the seat (`1 / 1 seats filled`, `Full` badge).
3. Student B visits, sees `Full`, and clicks **Join Waitlist** (receives queue position `#1`).
4. Student A cancels their RSVP through the UI $\to$ triggers the `cancelRsvpWithPromotion` Cloud Function $\to$ automatically rolls over the seat to Student B (`(1 reserved)`).
5. Student B visits the event page $\to$ `SeatClaimBanner` displays with active countdown $\to$ Student B clicks **Claim Seat**.
6. The seat is claimed, transitioning to `Going` (`1 / 1 seats filled`), and the waitlist member record is atomically finalized.

### B. Interactive Manual Capped-Event Walkthrough
1. Start emulators, seed data, and start frontend as described in Section 4.
2. Open `http://localhost:5173` and log in using disposable emulator credentials for Student A (`e2e.student.a@campusconnect.test`).
3. Navigate to **Events** (`/events`). Open the Event Composer by clicking **Create Event**.
4. Set Title: `Autonomous Robotics Lab`, Campus: `Apex Institute of Technology`, Community: `Apex AI & Robotics Society`, and set **Capacity** to `1`. Click **Publish**.
5. On the created event detail page, click **RSVP**. Notice the capacity updates to `1 / 1 seats filled` with a `Full` indicator.
6. Open an incognito browser window (or log out) and log in using disposable emulator credentials for Student B (`e2e.student.b@campusconnect.test`).
7. Navigate to the event. The button shows **Join Waitlist**. Click **Join Waitlist** $\to$ confirm in the modal showing Estimated Position `#1`.
8. Switch back to Student A and click **Cancel RSVP**. The capacity updates to reflect `(1 reserved)`.
9. Switch back to Student B and refresh the event page. The **Seat Claim Banner** appears ("A seat opened up for you!").
10. Click **Claim Seat**. Student B is now confirmed (`Going`), and the seat is claimed.

---

## 7. Resetting and Reseeding Local Data Safely

- **In-Memory Volatility:** Because emulators are started without the `--import` or `--export-on-exit` flags, stopping Terminal 1 (Ctrl+C / SIGINT) automatically destroys all transient state.
- **Reseeding Without Restarting Emulators:** Run `node scripts/seedE2E.mjs` in Terminal 2 at any time. It idempotently overwrites existing documents with clean deterministic baseline fixtures.

---

## 8. Running the Core Automated Test Suites

All test suites execute completely locally against the emulator environment:

```bash
# 1. Run all 1,007 Unit Tests (domain logic, UI components, hooks, permissions)
npm run test:unit

# 2. Run Firestore Security Rules Suite (579 acceptance test cases)
npm run test:rules

# 3. Run Cloud Functions v2 Boundary Tests (16 runtime integration tests)
npm run test:functions

# 4. Run Full Playwright End-to-End Suite (75 browser journeys)
npm run test:e2e
```

### Verified Test Results Summary

| Suite | Verified Command | Status | Exact Count | Execution Scope |
| :--- | :--- | :--- | :--- | :--- |
| **Unit Tests** | `npm run test:unit` | **PASSED** | **1,007 passed** (53 files) | Domain models, UI components, service functions, hooks |
| **Functions Boundary** | `npm run test:functions` | **PASSED** | **16 passed** (1 file) | GCFv2 callable triggers, Cloud Task dispatch, error bounds |
| **Firestore Rules** | `npm run test:rules` | **PASSED** | **579 passed** (4 files) | 488 core rules + 91 M24 acceptance test cases (TC-01–TC-91) |
| **Playwright E2E** | `npm run test:e2e` | **PASSED** | **75 passed** (13 files) | Complete multi-tenant browser journeys including capped events |
| **Production Build** | `npm run build` | **PASSED** | Built in 3.04s | 2,387 modules transformed; client bundles generated cleanly |
| **Application Lint** | `npx eslint src scripts tests` | **PASSED** | 0 errors, 0 warnings | Clean application source, scripts, and tests |

---

## 9. Common Issues & Troubleshooting

### 1. Port Conflicts (e.g. `Port 8080 is already in use`)
If a previous emulator or process did not exit cleanly:
```powershell
# In PowerShell (Windows):
netstat -ano | findstr :8080
# Identify the PID in the rightmost column and terminate it:
taskkill /PID <PID> /F
```
Repeat for ports `9099` (Auth) and `5001` (Functions) if necessary.

### 2. Frontend Connecting to Live Production Rather Than Emulators
- **Symptom:** Browser shows production event data or throws permission errors.
- **Cause:** Running `npm run dev` directly without `--mode e2e` causes Vite to read `VITE_USE_FIREBASE_EMULATOR=false` from `.env.local`.
- **Fix:** Always launch with `npm run dev -- --mode e2e --port 5173`.

### 3. Missing Java Runtime for Firestore Emulator
- **Symptom:** `Could not start Firestore Emulator: Java runtime not found`.
- **Fix:** Ensure Java 21 or higher is installed and `JAVA_HOME` is set on PATH. Verify with `java -version`.

### 4. MetadataLookupWarning in Node 22
- **Symptom:** `(node:XXXXX) MetadataLookupWarning: received unexpected error = All promises were rejected code = UNKNOWN`.
- **Explanation:** Node 22 runtime warning from the Google Cloud SDK trying to contact the GCP Compute Engine metadata server when running in an unauthenticated local environment. This is benign and expected when running against emulators.

---

## 10. Explicit Safety Warnings & Boundaries

> [!CAUTION]
> **Production Safety Warnings:**
> 1. **Do NOT run migration or repair scripts against live cloud:** Scripts such as `scripts/migrateUncappedToCapped.js` must only be run when `FIRESTORE_EMULATOR_HOST` is explicitly set.
> 2. **Fail-Closed Admin Client Guard:** `scripts/adminClient.mjs` strictly prohibits execution without `FIRESTORE_EMULATOR_HOST` unless `ALLOW_PRODUCTION_ADMIN_ACCESS=true` is explicitly set. Never set this variable in your local environment.
> 3. **Never hardcode credentials:** Never add service account keys, private keys, or API secrets to `.env.local`, `.env.e2e`, or repository files.
> 4. **Undeployed Status:** Milestone 24.3 backend functions are intentionally undeployed to production to preserve the zero-cost Firebase Spark plan.
