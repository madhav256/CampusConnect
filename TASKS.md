# CampusConnect Roadmap

**Status:** Status-aware roadmap (Milestone 13A)

Checked items describe work that exists in the current repository. Unchecked items are proposed or deferred; they are not implemented merely because they appear here.

## Delivered MVP foundation

- [x] React/Vite application setup.
- [x] Tailwind CSS integration and Campus Atelier visual system.
- [x] Firebase client initialization.
- [x] Firebase Authentication with persistent sessions.
- [x] Protected routing.
- [x] Student profile creation and editing.
- [x] Real-time bounded campus feed.
- [x] Text post creation and author-only deletion.
- [x] Transactional likes and denormalized like counter.
- [x] Real-time comments and batched comment counter updates.
- [x] Bounded multi-field student discovery.
- [x] Canonical connection lifecycle.
- [x] Scoped connection notifications.
- [x] Notification read, mark-all-read, and dismissal actions.
- [x] Discoverability and notification preferences.
- [x] Responsive navigation and reduced-motion support.
- [x] Firebase Hosting deployment configuration.
- [x] Deterministic recruiter demo login and Admin SDK seeding.
- [x] Development-only Firestore security audit panel.
- [x] Public README and recruiter demo documentation.
- [x] Milestone 13A documentation and architecture reconciliation.

## Current maintenance contract

- [x] Treat active source, `firestore.rules`, current schema, README, and recruiter guide as the source of truth.
- [x] Label planned features and schemas explicitly instead of listing them as implemented.
- [x] Keep documentation terminology aligned with the code: connections, not friends; Campus Atelier, not the obsolete indigo palette; current routes and components only.
- [ ] Re-run this documentation audit whenever a route, service, collection, or security invariant changes.

## Proposed next engineering milestones

### 1. Automated verification and Rules hardening

#### Milestone 13B Phase 1 — delivered

- [x] Add Vitest and `@firebase/rules-unit-testing`.
- [x] Add fixed Firestore Emulator configuration for `demo-campusconnect-rules-test`.
- [x] Add emulator-only safety checks, deterministic fixtures, and Rules bootstrap.
- [x] Add green regression coverage for users, posts, comments, likes, connections, and notifications.
- [x] Add pure helper tests for profile/notification normalization and canonical connection IDs.
- [x] Add safe local `test:unit`, `test:rules`, and aggregate `test` scripts.

#### Remaining 13B/13C work

- [ ] Add service integration tests against Auth and Firestore emulators.
- [ ] Audit the broad post-author update path.
- [ ] Strengthen comment-counter postconditions.
- [ ] Resolve the documented user/profile, snapshot, and notification read gaps.
- [ ] Add CI checks for lint, build, and automated tests.
- [ ] Add an application error boundary if the product requires a visible runtime recovery path.

### 2. Public/private data boundary

- [ ] Define the product policy for direct profile access when search discoverability is disabled.
- [ ] Separate public profile fields from private account/settings fields.
- [ ] Update user services, search reads, seed fixtures, and Rules through an additive migration.
- [ ] Verify that private fields are not returned to unrelated authenticated clients.

### 3. Scalable read paths

- [ ] Add cursor-based “load older posts” behavior while keeping the newest feed page real-time.
- [ ] Merge and deduplicate live and paginated post results.
- [ ] Measure directory growth before introducing an external search index.
- [ ] Define a threshold for replacing bounded client-side search with indexed search.

### 4. Trusted event processing

- [ ] Evaluate whether notification volume and event types justify Cloud Functions.
- [ ] If justified, move connection notification generation into idempotent server-side triggers.
- [ ] Preserve recipient-only notification reads and read-state updates.
- [ ] Add emulator coverage for trigger retries and duplicate delivery.

### 5. Minimal private messaging

- [ ] Design a connection-gated one-to-one conversation model.
- [ ] Add participant-only Rules and cursor-paginated messages.
- [ ] Add unread/read behavior and carefully scoped real-time listeners.
- [ ] Defer attachments, typing indicators, presence, group chat, and moderation tooling until the text MVP is stable.

## Explicitly deferred product ideas

These ideas are not commitments for the next release:

- image and file uploads;
- post sharing and bookmarks;
- clubs and events;
- marketplace or internship board;
- admin dashboard;
- dark mode and theme switching;
- rich media and advanced profile customization.

They should be reconsidered only after the reliability, privacy, and read-path milestones have evidence supporting them.
