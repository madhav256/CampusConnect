# CampusConnect

CampusConnect is a university student networking platform built with React, Tailwind CSS, and Firebase. It provides a real-time text feed, student discovery, academic profiles, canonical connection management, and scoped connection notifications.

- **Live Demo:** [https://campusconnect-cf191.web.app](https://campusconnect-cf191.web.app)
- **Demo access:** Open `/` and choose **Explore as Demo Student (Alex Rivera)** when the deployment has demo credentials configured.

The interface follows **The Campus Atelier** design system: warm paper and ink tones, terracotta actions, Newsreader editorial headings, Inter body text, and restrained Motion interactions.

## Recruiter and evaluator quick start

1. Visit the live deployment.
2. On the login page, locate **Recruiter & Evaluator Access**.
3. Choose **Explore as Demo Student (Alex Rivera)**.
4. Explore the authenticated experience as Alex Rivera, an architecture senior.

The seeded demo contains:

- ten text feed posts with comments and likes;
- Alex's profile plus seven peer profiles;
- accepted connections with Maya Lin and Marcus Vance;
- an incoming request from Devon Park;
- an outgoing request to Elena Rostova;
- one unread and one read connection notification.

The demo login is a normal unprivileged Firebase Auth account. The seeding script uses Firebase Admin SDK only during setup.

## Implemented features

### Authentication and profiles

- Email/password registration, login, logout, and password-reset email.
- Browser-local Auth persistence and protected routes.
- Editable profile fields: display name, bio, department, academic year, skills, and social links.
- Public profile view at `/users/:uid` with dynamic connection actions.
- Initials avatar fallback when no image URL is available.

### Feed and interactions

- Real-time text feed at `/dashboard`.
- Feed subscription limited to the newest 50 posts.
- Post creation and author-only deletion.
- Real-time comments with author-only deletion.
- Atomic like/unlike transactions with a denormalized `likesCount`.
- Motion feedback for likes and expandable comments.

### Discovery and connections

- `/discover` searches a bounded set of up to 100 users across name, department, year, and skills.
- Search is debounced and filters non-discoverable profiles on the client.
- `/connections` shows accepted connections and incoming/outgoing pending requests.
- Connection IDs use a lexicographically sorted pair of UIDs, ensuring one relationship document per student pair.
- Supported lifecycle: send, cancel, accept, decline, and remove.

### Notifications and settings

- `/notifications` subscribes to the newest 30 recipient-scoped notifications.
- Active notification types are connection requests and accepted connections.
- Mark one/all as read, dismiss, filter all/unread, and act on incoming requests.
- `/settings` manages search discoverability, connection notification preferences, and sign out.
- Account deletion is displayed as deferred because backend cascade cleanup is not implemented.

### Development security audit

In development builds, Settings and Notifications expose a security audit panel that exercises selected Firestore Rule rejection scenarios for notifications and user/settings documents. It is not a production test suite.

## Architecture

```text
src/main.jsx
  └── AuthProvider
      └── React Router / App
          └── Pages
              └── Components and hooks
                  └── Service modules
                      ├── Firebase Auth
                      └── Cloud Firestore
```

The active source structure is:

```text
src/
├── components/
│   ├── dev/
│   ├── feed/
│   ├── layout/
│   ├── notifications/
│   ├── search/
│   └── ui/
├── contexts/
├── data/
├── firebase/
├── hooks/
├── pages/
├── services/
└── utils/
```

UI components do not call Firestore directly. Service modules own Firebase operations, hooks own subscription lifecycles, and Firestore Security Rules enforce the client authorization boundary.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the runtime flow and [FIRESTORE_SCHEMA.md](FIRESTORE_SCHEMA.md) for the active data model.

## Security and data model highlights

- `posts/{postId}/likes/{uid}` stores individual likes instead of an unbounded user-ID array.
- Like and post-counter updates run in a Firestore transaction.
- Comment create/delete operations update the parent counter in a write batch.
- `connections/{minUid_maxUid}` stores one canonical relationship document for each pair.
- Connection Rules restrict pending creation, receiver-only acceptance, and participant deletion.
- Notifications live under `users/{recipientUid}/notifications` and list reads are recipient-scoped.
- Notification creation is tied by Rules to the corresponding connection transaction.
- User identity fields and selected settings types are validated by Rules.

The current `users/{uid}` document contains both profile and account/settings fields. Public UI components do not render email, but authenticated profile reads currently return the full document; a stronger public/private data split is future work.

## Current limitations

- No automated unit, integration, emulator, end-to-end, or CI test suite.
- Feed, directory, and notification reads are bounded rather than cursor-paginated.
- Discovery uses client-side filtering rather than full-text/fuzzy indexing.
- No Firebase Storage integration or media uploads.
- No post editing, sharing, search, or bookmarks.
- No private messaging, presence, read receipts, clubs, events, marketplace, or internship board.
- No email-verification enforcement, password-change UI, or account-deletion cascade.
- Notification generation currently occurs in client connection transactions rather than a background event processor.

These are explicit MVP boundaries, not undocumented missing routes.

## Local development

### Prerequisites

- Node.js 20 or newer.
- npm 10 or newer.
- A Firebase project for Auth and Firestore, or a compatible local environment.

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

The `VITE_FIREBASE_STORAGE_BUCKET` value is part of the standard Firebase web configuration shape; the active client does not initialize or use Firebase Storage.

### Run locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Seed a separate demo project

The hosted demo is already seeded. For another Firebase project, provide Admin credentials through the git-ignored `scripts/credentials/serviceAccountKey.json`, `GOOGLE_APPLICATION_CREDENTIALS`, Application Default Credentials, or a local emulator, then run:

```bash
npm run seed:demo
```

The seeder uses explicit demo ID whitelists, merge-only writes, and no bulk deletion routines. Never commit service-account credentials.

## Verification commands

Pure helper tests run without Firebase:

```bash
npm run test:unit
```

Firestore Rules tests run only inside the fixed synthetic emulator project `demo-campusconnect-rules-test`:

```bash
npm run test:rules
```

The Rules command starts and stops the Firestore Emulator automatically. It does not read `.env.local`, use service-account credentials, invoke the demo seeder, or connect to the recruiter project. The Rules suite contains green regression tests plus explicitly labeled tests documenting current 13C Rules gaps.

The broader local checks are:

```bash
npm run lint
npm run test
npm run build
npm run preview
```

The current automated coverage does not include service integration, end-to-end tests, or CI. The development `SecurityTestPanel` remains a separate manual audit tool and is not used by these tests.

## Documentation map

- [ARCHITECTURE.md](ARCHITECTURE.md) — active runtime architecture and limitations.
- [FEATURES.md](FEATURES.md) — implemented/deferred feature inventory.
- [FIRESTORE_SCHEMA.md](FIRESTORE_SCHEMA.md) — active collections and Rules behavior.
- [COMPONENT_LIBRARY.md](COMPONENT_LIBRARY.md) — current reusable components.
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) — Campus Atelier visual system.
- [RECRUITER_DEMO_GUIDE.md](RECRUITER_DEMO_GUIDE.md) — technical walkthrough and demo precautions.
- [TASKS.md](TASKS.md) — status-aware roadmap.
