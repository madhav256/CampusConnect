# CampusConnect — Recruiter Demo Guide

This guide is an internal reference for demonstrating the current CampusConnect platform and explaining its engineering trade-offs. It describes implemented behavior only; future work is labeled separately.

---

## 1. Quick demo script

This sequence demonstrates the seeded workflow across core social and event domains without mutating seeded live relationships.

```text
/ (landing and demo login)
  └─▶ /dashboard (campus feed and atomic interactions)
        └─▶ /discover (bounded student search)
              └─▶ /users/:uid (profile and 1-to-1 message CTA)
                    └─▶ /messages (canonical 1:1 conversation)
                          └─▶ /communities (student organizations & role-based authority)
                                └─▶ /events (discovery, Going tab, capacity indicators)
                                      └─▶ /events/:eventId (RSVP, WaitlistModal, SeatClaimBanner)
                                            └─▶ /notifications or /settings (preferences & wrap-up)
```

### 0:00–0:15 — Landing and demo login

- **Route:** `/`
- **Show:** The **Recruiter & Evaluator Access** card and **Explore as Demo Student (Alex Rivera)**.
- **Explain:** This is an ordinary unprivileged Firebase Auth account. The login page uses `VITE_DEMO_USER_EMAIL` and `VITE_DEMO_USER_PASSWORD` when those environment variables are configured; it does not bypass authentication or security rules.
- **Technical points:** `AuthContext` owns session state and browser-local persistence. `ProtectedRoute` redirects unauthenticated visitors to `/`.

### 0:15–0:35 — Feed and atomic interactions

- **Route:** `/dashboard`
- **Show:** The text composer, a like action, and an expanded comment list.
- **Explain:** The feed uses a real-time Firestore listener for newer posts merged with cursor-based pagination for older posts. A like transaction creates/deletes the current user's like document and adjusts the denormalized `likesCount` together.
- **Technical points:** `onSnapshot`, `fetchOlderPosts` with `startAfter`, `runTransaction`, Motion feedback, and author-only post/comment deletion.

### 0:35–0:50 — Student discovery & public/private separation

- **Route:** `/discover`
- **Show:** Search for `design` or `robotics`, then navigate to a peer profile at `/users/:uid`.
- **Explain:** The client queries the `directoryIndex` projection for up to 100 discoverable users ordered by `updatedAt`, debounces input by 300 ms, and filters locally. Private account data (including email) lives strictly in `users/{uid}` under owner-only rules; public profile fields are read from `publicProfiles/{uid}`.
- **Technical points:** Strict three-collection boundary (`users`, `publicProfiles`, `directoryIndex`), two-minute directory cache, and field-level privacy.

### 0:50–1:05 — Canonical connections & 1-to-1 private messaging

- **Routes:** `/connections` and `/messages`
- **Show:** Accepted connections, incoming/outgoing requests, active conversations, and message composition.
- **Explain:** Each pair uses one canonical document ID (`minUid_maxUid`). Messaging is strictly connection-gated. Disconnecting converts conversations into read-only archives while preserving history.
- **Technical points:** Firestore Rules enforce bidirectional transactional coupling between conversation metadata (`lastMessage`, `unreadCount`, `updatedAt`) and child message documents.

### 1:05–1:20 — Student communities & role-based leadership

- **Route:** `/communities` and `/communities/:communityId`
- **Show:** Sponsoring student communities (e.g. Apex AI & Robotics Society), membership roles (`member`, `moderator`, `admin`), community feeds, and the community Events tab.
- **Explain:** Communities provide institutional tenancy and authorization boundaries. Only active community leaders (moderators or admins) can publish or manage events sponsored by that community.

### 1:20–1:40 — Campus events, RSVPs & lifecycle management

- **Routes:** `/events` and `/events/:eventId`
- **Show:** Upcoming and Past tabs, category filter pills, personal Going tab, attendee preview roster, and organizer management toolbar (`EventManagementToolbar`).
- **Explain:** Event RSVPs use canonical `{eventId}_{userId}` documents. Community leaders have role-based management tools: editing within adaptive mutability rules, cancellation with registration closure and resumable notification delivery ledgers, republishing, and administrator-only deletion.
- **Technical points:** Reactive temporal boundary timers trigger state transitions without polling; orphaned RSVPs surface in an attention container with cleanup affordances.

### 1:40–2:00 — Capped events, capacity coordinators & FIFO waitlists

- **Route:** `/events/:eventId` (capped event, e.g. `e2e-event-capped-micro-lab` or `e2e-event-capped-full-waitlist`)
- **Show:**
  - `CapacityIndicator`: live occupancy progress bar, remaining seat counter, and waitlist badge;
  - `WaitlistModal`: modal showing estimated or confirmed queue position, reservation policies, and voluntary Leave action;
  - `SeatClaimBanner`: sticky banner with live countdown timer and interactive Claim/Decline actions when a seat is offered.
- **Explain:** Milestone 24 coordinates capacity using `eventCapacities/{eventId}` to prevent overbooking. When full, applicants join a deterministic FIFO waitlist (`eventWaitlistSlots`, `eventWaitlistMembers`). If an attendee cancels, the queue head is automatically normalized past holes and offered a seat with a 24-hour claim window.
- **Technical points:** ADR-024 Revision 33 authoritative contracts; 4-outcome queue head normalization engine (`normalizeQueueHead`); Cloud Tasks durable continuations (`eventWaitlistContinuations`); notification outbox pattern (`eventWaitlistOutbox`).

### 2:00–2:15 — Notifications, settings preferences & wrap-up

- **Routes:** `/notifications` and `/settings`
- **Show:** Scoped notifications (connection requests, accepted connections, event RSVPs, event cancellations, event waitlist offers), preference toggles (`eventWaitlistOffers`), and sign out.
- **Explain:** Disabling a notification preference suppresses display without deleting persisted records. Deep links navigate directly to referenced events where claim banners handle seat registration.

---

## 2. Technical talking points

### Option A local-first zero-cost architecture

CampusConnect operates strictly on the **Firebase Spark plan** at **₹0 cloud spend**:
- Frontend: Single-page application served via Firebase Hosting.
- Data & Auth: Managed Cloud Firestore and Firebase Authentication.
- Server microservices: Google Cloud Functions v2 (HTTPS callables, Cloud Tasks queue workers, scheduled sweepers, and Firestore triggers) execute locally using the Firebase Emulator Suite (`demo-campusconnect-rules-test`).
- Production cloud deployment of Cloud Functions/Tasks is deferred pending cloud plan decisions.
- An alternative edge worker proposal ([`ADR-025.md`](ADR-025.md)) evaluating Cloudflare Workers Free remains `PROPOSED — PENDING EXPLICIT APPROVAL`.

### Concurrency-safe capacity coordination (ADR-024 Revision 33)

- **Atomic Admissions:** Direct admissions execute in Firestore transactions checking `confirmedCount + offeredCount < capacity` and `waitlistCount == 0`, incrementing `confirmedCount` and writing `eventRsvps` atomically.
- **Monotonic Queue Sequence:** Waitlist joins increment `nextSequence`, guaranteeing strict FIFO ordering.
- **Hole-Skipping Normalization:** When candidates withdraw, decline, or expire, `normalizeQueueHead` skips terminal holes via a 4-outcome discriminated union (`normal_waiting`, `terminal_hole`, `out_of_bounds`, `unexpected_status`).
- **Asynchronous Continuation Durability:** High-latency multi-step operations stage tasks in `eventWaitlistContinuations/{eventId}` with generation fencing and lease workers, dispatched asynchronously via Cloud Tasks.

### Multi-tenant isolation & security rules as source of truth

- UI checks provide user feedback, but `firestore.rules` is the authoritative authorization boundary.
- All primary collections enforce strict tenant scoping (`campusId == getUserCampusId()`). Cross-tenant access is rejected with `permission-denied`.
- Section 7 rules govern capacity coordinators, sequential waitlist slots, and private member records.
- Server-only collections (`eventWaitlistContinuations`, `eventWaitlistOutbox`, `systemWaitlistJobs`) are completely locked against client access (`allow read, write: if false;`).

---

## 3. Useful interview questions

### How are overbooking and race conditions prevented on popular events?
Direct admissions use Firestore transactions with compare-and-set preconditions on the coordinator document (`eventCapacities/{eventId}`). If concurrent requests contend for the last seat, only one transaction commits; subsequent transactions observe the updated count, fail the precondition, and redirect the applicant to join the waitlist.

### Why separate `eventWaitlistSlots` from `eventWaitlistMembers`?
- `eventWaitlistSlots/{eventId}_{seq}` is the sequential queue log ordered by `sequenceNumber`. It provides an immutable audit trail and enables the head pointer to advance linearly.
- `eventWaitlistMembers/{eventId}_{userId}` is a private student index keyed by composite ID `{eventId}_{userId}`. It provides `O(1)` point reads and subscriptions for the student's active queue position without requiring costly collection scans. Collection queries (`list`) on members are prohibited by Security Rules to protect student privacy.

### Why use an outbox pattern for waitlist offer notifications?
Transactionally writing notifications inside the promotion callable would increase write contention and violate Firestore's rule evaluation call budget. Instead, the promotion transaction writes a lightweight outbox record to `eventWaitlistOutbox/{eventId}_{seq}`, which triggers the background worker `deliverWaitlistOfferNotification` to deliver the notification asynchronously.

---

## 4. Honest limitations

Current limitations include:

- Automated testing includes 1,032 unit tests across 55 files + 16 Cloud Functions boundary tests = 1,048 total tests (`npm run test:unit`), 579 Firestore security rules tests (`npm run test:rules`), and 76 Playwright E2E browser tests across 16 spec files (`npm run test:e2e`).
- Directory search uses client-side filtering over the `directoryIndex` projection rather than an external indexed search engine (e.g. Algolia or Typesense).
- Notifications are bounded to the newest 30 items rather than cursor-paginated.
- No media upload or Firebase Storage integration (initials avatar fallback).
- No post editing, sharing, bookmarks, or global marketplace.
- Event ticketing, payment processing, QR check-in, and verified attendance tracking remain deferred.
- Production deployment of Cloud Functions/Tasks remains deferred under Option A; all microservice testing and demonstration execute locally.

---

## 5. Demo troubleshooting

| Issue | Cause | Resolution |
| --- | --- | --- |
| Demo login fails locally | Demo environment variables are absent or do not match seeded Auth account. | Check `.env.local` for `VITE_DEMO_USER_EMAIL` and `VITE_DEMO_USER_PASSWORD`. |
| Feed, events, or directory empty | The local Firebase emulator is not seeded or points at an unseeded project. | Run `npm run seed:demo` with Admin credentials or execute against the local emulator suite. |
| Waitlist actions fail | Cloud Functions emulator is not running or emulators were not started with `--only firestore,auth,functions`. | Start emulators with `npx firebase emulators:start --only firestore,auth,functions` or run E2E suites via `npm run test:e2e`. |
| Development audit panel is not visible | The application is running in a production build (`npm run preview`). | The panel is intentionally development-only (`npm run dev`); inspect the regular settings UI instead. |

The seeder uses explicit demo ID whitelists, merge-only writes, and no bulk deletion routines. Never commit service-account credentials.

---

## 6. Thirty-second project summary

> CampusConnect is a multi-tenant university student networking platform built with React, Tailwind CSS, and Firebase under a strict local-first zero-cost operating model (Option A).
>
> It delivers an editorial text feed, bounded student discovery, canonical connection management, 1-to-1 private messaging, student communities, and a comprehensive campus event platform. The event architecture features role-based lifecycle management, attendee RSVPs, resumable cancellation delivery ledgers, and concurrency-safe capped events with automated FIFO waitlists and live seat offers conforming to ADR-024 Revision 33.
>
> The codebase is reinforced by 1,048 Vitest unit/boundary tests, 579 Firestore Security Rules regression tests, and 76 Playwright E2E browser tests, maintaining clean architectural boundaries and zero cloud spend.
