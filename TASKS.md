# CampusConnect Roadmap

**Status:** Status-aware roadmap (Milestone 14B / Milestone 15)

Checked items describe work that exists in the current repository. Unchecked items are proposed or deferred; they are not implemented merely because they appear here.

## Delivered MVP foundation

- [x] React/Vite application setup.
- [x] Tailwind CSS integration and Campus Atelier visual system.
- [x] Firebase client initialization.
- [x] Firebase Authentication with persistent sessions.
- [x] Protected routing.
- [x] Student profile creation and editing.
- [x] Real-time campus feed.
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
- [x] Milestone 13C Firestore Rules hardening and emulator regression expansion.
- [x] Milestone 14: Cursor-based feed pagination (`startAfter`) merged with real-time newer-posts listener and deduplicated feed state.
- [x] Milestone 14B: Strict public/private profile separation across three collections (`users` private authority, `publicProfiles` public-profile authority, `directoryIndex` discoverability projection).
- [x] Automated test suites: 53 Vitest unit tests and 97 Firestore Emulator security rules tests passing.

## Current maintenance contract

- [x] Treat active source, `firestore.rules`, current schema, README, and recruiter guide as the source of truth.
- [x] Label planned features and schemas explicitly instead of listing them as implemented.
- [x] Keep documentation terminology aligned with the code: connections, not friends; Campus Atelier, not the obsolete indigo palette; current routes and components only.
- [x] Re-run this documentation audit whenever a route, service, collection, or security invariant changes (Milestone 15 Unit 15.1).

## Active engineering milestone

### Milestone 15 — Post-14B Hardening, Performance & Architecture Reconciliation

- [ ] **15.1 Documentation & Roadmap Reconciliation:** Align all project documentation with locked 14B architecture, document 3-collection model, test suites (53 unit / 97 rules), and remove stale claims.
- [ ] **15.2 Seeder & Security Test Runner Alignment:** Update `seedDemoData.mjs` to project into all three 14B collections; align `securityTestRunner.js` and `SecurityTestPanel.jsx` to initialize against strict rules without prohibited client-side deletions.
- [ ] **15.3 Dead Code Removal & Search Error Recovery:** Remove confirmed dead functions (`normalizeProfile`, `updateCommentsCount`, `subscribeToBootstrapPosts`); wire active retry in `useUserSearch.js` and `Discover.jsx`.
- [ ] **15.4 Firestore Rules Hardening:** Enforce strict `isValidPostCreate()` (exact 8 keys, bounds, timestamps); remove obsolete `users` fallback in `isValidCommentSchema` and `isValidActorProfile`; add comprehensive rules tests.
- [ ] **15.5 Frontend Performance & UX:** Route-level `React.lazy` and `Suspense`; top-level `ErrorBoundary`; memoize `PostCard` and derived hook states; mitigate `Connections.jsx` tab-switch read storm; add confirmation for destructive connection actions.
- [ ] **15.6 Test Expansion & Hygiene:** Add meaningful behavioral unit coverage for all six domain services; consolidate cutover test files; update test fixtures to strict private schema.

## Proposed next engineering milestones

### 1. Trusted event processing

- [ ] Evaluate whether notification volume and event types justify Cloud Functions.
- [ ] If justified, move connection notification generation into idempotent server-side triggers.
- [ ] Preserve recipient-only notification reads and read-state updates.
- [ ] Add emulator coverage for trigger retries and duplicate delivery.

### 2. Search infrastructure scaling

- [ ] Keep client-side `directoryIndex` projection search for the present application scale.
- [ ] Revisit external search indexing (e.g., Algolia or Typesense) only when actual directory size or observed query latency demonstrates a concrete need.

### 3. Minimal private messaging

- [ ] Design a connection-gated one-to-one conversation model.
- [ ] Add participant-only Rules and cursor-paginated messages.
- [ ] Add unread/read behavior and carefully scoped real-time listeners.
- [ ] Defer attachments, typing indicators, presence, group chat, and moderation tooling until the text MVP is stable.

### 4. Continuous Integration & End-to-End Testing

- [ ] Configure CI pipeline for lint, build, unit tests, and emulator rules tests.
- [ ] Add browser-level end-to-end smoke tests.

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
