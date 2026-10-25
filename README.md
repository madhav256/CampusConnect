# CampusConnect

CampusConnect is a university student networking platform built with React, Tailwind CSS, and Firebase. It provides a real-time text feed, student discovery, academic profiles, canonical connection management, 1-to-1 private messaging, student communities, campus events, event RSVPs, event lifecycle management, resumable cancellation delivery, and capped-event capacity coordination with FIFO waitlists.

- **Live Demo (Hosting):** [https://campusconnect-cf191.web.app](https://campusconnect-cf191.web.app)
- **Demo access:** Open `/` and choose **Explore as Demo Student (Alex Rivera)** when demo credentials are configured.
- **Operating Mode:** **Option A** (Firebase Spark Plan, Local Firebase Emulator Suite, ₹0 Cloud Spend).

The interface follows **The Campus Atelier** design system: warm paper and ink tones, terracotta actions, Newsreader editorial headings, Inter body text, and restrained Motion interactions.

## Recruiter and evaluator quick start

1. Visit the demo deployment or run locally via the Firebase Emulator Suite.
2. On the login page, locate **Recruiter & Evaluator Access**.
3. Choose **Explore as Demo Student (Alex Rivera)**.
4. Explore the authenticated experience as Alex Rivera, an architecture senior.

The seeded demo contains:

- ten text feed posts with comments and likes;
- Alex's profile plus seven peer profiles across multi-tenant campus boundaries;
- accepted connections, incoming requests, and outgoing requests;
- 1-to-1 private messaging threads with unread counters and read-only archive retention upon disconnection;
- student communities with role-based membership and community feeds;
- campus events with category filters, temporal tabs (Upcoming, Past, Going), and organizer management toolbar;
- capped-event capacity coordinators with vacancy progress bars and FIFO waitlist queues;
- in-app notifications for connection requests, connection acceptances, event RSVPs, event cancellations, and waitlist offers.

The demo login is a normal unprivileged Firebase Auth account. The seeding script uses Firebase Admin SDK only during setup.

## Implemented features

### Authentication and profiles

- Email/password registration, login, logout, and password-reset email.
- Browser-local Auth persistence and protected routes.
- Editable profile fields: display name, bio, department, academic year, skills, and social links.
- Public profile view at `/users/:uid` with dynamic connection actions and direct messaging CTAs.
- Strict public/private separation: private account metadata in `users/{uid}`, public networking fields in `publicProfiles/{uid}`, and search projection in `directoryIndex/{uid}`.
- Initials avatar fallback when no image URL is available.

### Feed and interactions

- Real-time text feed at `/dashboard`.
- Real-time subscription to newer posts merged with cursor-based pagination for older posts.
- Post creation and author-only deletion.
- Real-time comments with author-only deletion and parent counter synchronization.
- Atomic like/unlike transactions with a denormalized `likesCount`.
- Motion feedback for likes and expandable comments.

### Discovery and connections

- `/discover` searches the `directoryIndex` projection of discoverable students across name, department, year, and skills.
- Search is debounced (300 ms) and operates over discoverable profiles.
- `/connections` shows accepted connections and incoming/outgoing pending requests.
- Connection IDs use a lexicographically sorted pair of UIDs, ensuring one relationship document per student pair.
- Supported lifecycle: send, cancel, accept, decline, and remove.

### 1-to-1 Private Messaging

- Protected routes at `/messages` (desktop split-pane) and `/messages/:conversationId` (mobile view).
- Canonical conversation IDs matching connection IDs (`min_max`).
- Real-time active threads with cursor pagination for older messages.
- Connection-gated sends: sending messages requires accepted connection status.
- Disconnected conversations transition to read-only archives.

### Communities and campus scoping

- Multi-tenant architecture partitioned by `campusId`.
- Student communities at `/communities` with role-based membership (`member`, `moderator`, `admin`).
- Sponsoring community integration with event publishing and moderation authority.

### Campus Events & Waitlists

- Campus-wide event discovery on `/events` with Upcoming, Past, and personal Going tabs.
- Event lifecycle management: role-based edit, cancel, republish, and hard-delete modals on `/events/:eventId`.
- Event RSVP participation tracking with real-time attendee rosters and Going badges.
- Resumable cancellation notification fan-out via durable delivery ledgers (`eventNotificationDeliveries/{eventId}`).
- Capped-event capacity coordination (`eventCapacities/{eventId}`) preventing overbooking.
- FIFO waitlists (`eventWaitlistSlots`, `eventWaitlistMembers`) with deterministic sequence ordering.
- Automated seat offers with configurable offer windows (default 24h), live countdown timers, and Claim/Decline actions via `SeatClaimBanner`.
- Interactive `WaitlistModal` displaying estimated or confirmed queue positions, reservation terms, and voluntary Leave actions.
- Live occupancy visualization and waitlist badges via `CapacityIndicator`.

### Notifications and settings

- `/notifications` subscribes to the newest 30 recipient-scoped notifications.
- Active notification types: connection requests, accepted connections, event RSVPs, event cancellations, and waitlist seat offers.
- Event and waitlist notifications provide deep-links and durable title rendering even if the referenced event is deleted.
- Mark one/all as read, dismiss, filter all/unread, and inline connection actions.
- `/settings` manages search discoverability, notification preferences (`connectionRequests`, `connectionAccepted`, `eventRsvps`, `eventCancellations`, `eventWaitlistOffers`), and sign out.

## Architecture & Local-First Zero-Cost Model

```text
src/main.jsx
  └── AuthProvider
      └── React Router / App
          └── Pages
              └── Components and hooks
                  ├─ Service modules ──▶ Cloud Firestore / Firebase Auth
                  └─ Callable functions ──▶ Google Cloud Functions v2 (Local Emulators)
```

### Option A Operating Mode

The application follows **Option A: Firebase Spark Plan, Local Emulators, ₹0 Cloud Spend**:
- Static hosting: Firebase Hosting serves the compiled SPA.
- Database: Cloud Firestore with security rules enforcing tenant boundaries and invariants.
- Privileged microservices: Google Cloud Functions v2 (HTTPS callables, Cloud Tasks workers, scheduled sweepers, and Firestore triggers) execute locally using the Firebase Emulator Suite.
- Cloud spend invariant: Strict ₹0 budget; no credit cards, Blaze plans, or paid cloud resources are provisioned.
- Production cloud deployment of backend functions/tasks remains deferred.
- An alternative serverless edge proposal using Cloudflare Workers Free ([`ADR-025.md`](ADR-025.md)) remains unapproved (`PROPOSED — PENDING EXPLICIT APPROVAL`).

The active source structure is:

```text
src/
├── components/
│   ├── community/
│   ├── dev/
│   ├── events/
│   ├── feed/
│   ├── layout/
│   ├── messages/
│   ├── notifications/
│   ├── search/
│   └── ui/
├── contexts/
├── data/
├── firebase/
├── hooks/
├── pages/
├── server/
├── services/
└── utils/
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the runtime flow and [FIRESTORE_SCHEMA.md](FIRESTORE_SCHEMA.md) for the active data model.

## Security and data model highlights

- Strict three-collection boundary: `users/{uid}` (private authority), `publicProfiles/{uid}` (public-profile authority), and `directoryIndex/{uid}` (discoverability projection).
- Individual like documents with transaction-coupled like counters.
- Canonical connection pairs (`min_max`) with rule-enforced state transitions.
- Bidirectional transactional coupling between conversation summaries and immutable child messages.
- Durable delivery ledgers (`eventNotificationDeliveries/{eventId}`) with compare-and-set progression and point-read security isolation.
- Capacity coordinators (`eventCapacities/{eventId}`) enforcing direct admission and waitlist invariants.
- Sequential waitlist slots (`eventWaitlistSlots`) with owner/leader-only read boundaries and non-head withdrawal constraints.
- Private student waitlist index (`eventWaitlistMembers`) with list queries strictly prohibited.
- Server-only collections (`eventWaitlistContinuations`, `eventWaitlistOutbox`, `systemWaitlistJobs`) locked unconditionally against client operations (`allow read, write: if false;`).

## Current limitations

- 1,032 Vitest unit tests across 55 files (+ 16 Cloud Functions boundary tests = 1,048 total), 579 Firestore Emulator rules tests across 16 suites (including TC-01 through TC-91), and 76 Playwright E2E browser tests across 16 spec files.
- Directory and notification reads are bounded rather than cursor-paginated (feed and messages support cursor pagination).
- Discovery uses client-side filtering over the `directoryIndex` projection rather than an external search index.
- No Firebase Storage integration or media uploads.
- No post editing, sharing, search, or bookmarks.
- No presence, read receipts, marketplace, or internship board.
- Event ticketing, payment processing, QR check-in, and verified attendance tracking remain deferred.
- Production cloud deployment of Cloud Functions/Tasks remains deferred under Option A.

## Local development

### Prerequisites

- Node.js 20 or newer.
- npm 10 or newer.
- Java Runtime Environment (JRE) for running the Firebase Emulator Suite.
- A Firebase project for Auth and Firestore, or the local emulator.

### Install

```bash
npm install
```

### Configure environment

Copy `.env.example` to `.env.local` and provide the Firebase web configuration:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_web_app_id

# Optional one-click local demo access
VITE_DEMO_USER_EMAIL=demo.student@campusconnect.edu
VITE_DEMO_USER_PASSWORD=your_local_demo_password
```

### Run locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Seed local or demo data

For a separate Firebase project, provide Admin credentials through the git-ignored `scripts/credentials/serviceAccountKey.json`, `GOOGLE_APPLICATION_CREDENTIALS`, Application Default Credentials, or the local emulator, then run:

```bash
npm run seed:demo
```

The seeder uses explicit demo ID whitelists, merge-only writes, and no bulk deletion routines. Never commit service-account credentials.

## Verification commands

Unit & boundary tests run via Vitest (1,032 unit tests across 55 files + 16 Cloud Functions boundary tests = 1,048 total):

```bash
npm run test:unit
```

To run the Cloud Functions runtime boundary tests specifically:

```bash
npx vitest run tests/boundary/functions/waitlistBoundary.test.js
```

Firestore Security Rules tests run inside the fixed synthetic emulator project `demo-campusconnect-rules-test` (579 passing tests across 16 suites, including TC-01 through TC-91):

```bash
npm run test:rules
```

The Rules command starts and stops the Firestore Emulator automatically. It does not read `.env.local`, use service-account credentials, invoke the demo seeder, or connect to production.

End-to-end browser tests run via Playwright against the Firebase Emulator suite (76 passing tests across 16 spec files):

```bash
npm run test:e2e
```

The comprehensive local check suite is:

```bash
npm run lint
npm run test:unit
npm run test:rules
npm run test:e2e
npm run build
npm run preview
```

Automated verification is also continuously validated via GitHub Actions CI across lint, unit, rules, build, and E2E suites.

## Documentation map

- [ARCHITECTURE.md](ARCHITECTURE.md) — active runtime architecture and limitations.
- [FEATURES.md](FEATURES.md) — implemented/deferred feature inventory.
- [FIRESTORE_SCHEMA.md](FIRESTORE_SCHEMA.md) — active collections and Rules behavior.
- [COMPONENT_LIBRARY.md](COMPONENT_LIBRARY.md) — current reusable components.
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) — Campus Atelier visual system.
- [RECRUITER_DEMO_GUIDE.md](RECRUITER_DEMO_GUIDE.md) — technical walkthrough and demo precautions.
- [TASKS.md](TASKS.md) — status-aware roadmap.
- [LOCAL_DEV_GUIDE.md](LOCAL_DEV_GUIDE.md) — local-first Option A development guide.
