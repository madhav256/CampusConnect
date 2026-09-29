# CampusConnect Roadmap

**Status:** Status-aware roadmap (Milestone 15 Delivered / Milestone 16 Active)

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
- [x] Automated test suites: 204 Vitest unit tests and 154 Firestore Emulator security rules tests passing.

## Current maintenance contract

- [x] Treat active source, `firestore.rules`, current schema, README, and recruiter guide as the source of truth.
- [x] Label planned features and schemas explicitly instead of listing them as implemented.
- [x] Keep documentation terminology aligned with the code: connections, not friends; Campus Atelier, not the obsolete indigo palette; current routes and components only.
- [x] Re-run this documentation audit whenever a route, service, collection, or security invariant changes (Milestone 15 Unit 15.1).

## Delivered engineering milestones

### Milestone 15 — Post-14B Hardening, Performance & Architecture Reconciliation (Delivered)

- [x] **15.1 Documentation & Roadmap Reconciliation:** Align all project documentation with locked 14B architecture, document 3-collection model, test suites (120 unit / 107 rules), and remove stale claims.
- [x] **15.2 Seeder & Security Test Runner Alignment:** Update `seedDemoData.mjs` to project into all three 14B collections; align `securityTestRunner.js` and `SecurityTestPanel.jsx` to initialize against strict rules without prohibited client-side deletions.
- [x] **15.3 Dead Code Removal & Search Error Recovery:** Remove confirmed dead functions (`normalizeProfile`, `updateCommentsCount`, `subscribeToBootstrapPosts`); wire active retry in `useUserSearch.js` and `Discover.jsx`.
- [x] **15.4 Firestore Rules Hardening:** Enforce strict `isValidPostCreate()` (exact 8 keys, bounds, timestamps); remove obsolete `users` fallback in `isValidCommentSchema` and `isValidActorProfile`; add comprehensive rules tests.
- [x] **15.5 Frontend Performance & UX:** Route-level `React.lazy` and `Suspense`; top-level `ErrorBoundary`; memoize `PostCard` and derived hook states; mitigate `Connections.jsx` tab-switch read storm; add confirmation for destructive connection actions.
- [x] **15.6 Test Expansion & Hygiene:** Add meaningful behavioral unit coverage for all six domain services; consolidate cutover test files; update test fixtures to strict private schema.

## Active engineering milestone

### Milestone 16 — Minimal 1-to-1 Private Messaging

Provides direct communication between connected students. Architectural constraints include: exactly one conversation per connected student pair; canonical conversation ID identical to the connection ID (`min_max`); messaging strictly gated by `connections/{id}.status == "accepted"`; append-only message documents; past messages remain readable after disconnection while new messages are blocked; conversation-level unread tracking; cursor pagination with real-time active thread updates; and no group chat or media attachments in this milestone.

- [x] **16.1 Documentation & Test Count Reconciliation:** Reconcile stale test counts across all documentation, mark Milestone 15 complete, and establish the Milestone 16 roadmap.
- [x] **16.2 Core Messaging Service & Unit Tests:** Implement `src/services/messageService.js` supporting canonical conversation IDs (`min_max`), conversation metadata, append-only message creation, cursor pagination, and mark-as-read; add pure unit test suite in `tests/unit/messageService.test.js`.
- [x] **16.3 Firestore Security Rules & Emulator Tests:** Enforce connection-gated authorization (`connections/{id}.status == "accepted"` required to send), participant-only access, immutable messages, self-only unread resets, 4-key `lastMessage` schema (`id`, `content`, `senderId`, `createdAt`), and bidirectional transactional coupling (`getAfter()` / `existsAfter()`); expand emulator tests in `tests/rules/firestore.rules.test.js`.
- [x] **16.4 Messaging Hooks & State Management:** Implement `useConversations.js` (conversation list with unread counters) and `useConversationMessages.js` (active thread listener, older message cursor pagination, error recovery).
- [x] **16.5 UI Implementation & Integration:** Implement responsive split-pane `/messages` view (`Messages.jsx`, `ConversationList`, `MessageThread`, `MessageBubble`, `MessageComposer`), add Navbar Messages item with unread badge, and wire "Message" CTAs from `PublicProfile.jsx` and `Connections.jsx`.
- [x] **16.6 Demo Data, Verification & Final Reconciliation:** Update seed script with deterministic demo conversations, verify browser smoke flow, confirm full test suites passing, and reconcile final documentation.

## Proposed next engineering milestones

### 1. Trusted event processing

- [ ] Evaluate whether notification volume and event types justify Cloud Functions.
- [ ] If justified, move connection notification generation into idempotent server-side triggers.
- [ ] Preserve recipient-only notification reads and read-state updates.
- [ ] Add emulator coverage for trigger retries and duplicate delivery.

### 2. Search infrastructure scaling

- [ ] Keep client-side `directoryIndex` projection search for the present application scale.
- [ ] Revisit external search indexing (e.g., Algolia or Typesense) only when actual directory size or observed query latency demonstrates a concrete need.

### 3. Continuous Integration & End-to-End Testing

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
