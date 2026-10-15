# CampusConnect Roadmap

**Status:** Status-aware roadmap (Milestone 23 Delivered)

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
- [x] Milestone 16: Minimal 1-to-1 Private Messaging (canonical conversation IDs, participant-only authorization, append-only messages, unread tracking).
- [x] Milestone 18: Multi-Tenancy Foundation (campus scoping across all primary entities, cross-tenant isolation).
- [x] Milestone 19: Student Communities (directory, detail, membership authority, community feed, moderation).
- [x] Milestone 20: Campus Events (lifecycle, visibility tiers, discovery, community integration, event management).
- [x] Milestone 21: Event RSVPs & Participation Discovery (RSVP lifecycle, attendee preview, Going tab, badges, resolution pipeline, error recovery).
- [x] Milestone 22: Event Lifecycle Management (adaptive mutability, cancellation, republishing, hard delete, reactive timers).
- [x] Milestone 23: Event Notifications & Resumable Cancellation Delivery (RSVP notifications, cancellation fan-out, delivery ledger, point-read security isolation).
- [x] Automated test suites: 880 Vitest unit tests across 43 files, 486 Firestore Emulator security rules tests across 16 suites, and 74 Playwright E2E browser tests across 12 spec files passing.

## Current maintenance contract

- [x] Treat active source, `firestore.rules`, current schema, README, and recruiter guide as the source of truth.
- [x] Label planned features and schemas explicitly instead of listing them as implemented.
- [x] Keep documentation terminology aligned with the code: connections, not friends; Campus Atelier, not the obsolete indigo palette; current routes and components only.
- [x] Maintain multi-tenant security boundaries and tenant isolation across all collections.
- [x] Re-run documentation audit whenever a route, service, collection, or security invariant changes.

## Delivered engineering milestones

### Milestone 15 — Post-14B Hardening, Performance & Architecture Reconciliation (Delivered)

- [x] **15.1 Documentation & Roadmap Reconciliation:** Align all project documentation with locked 14B architecture, document 3-collection model, test suites, and remove stale claims.
- [x] **15.2 Seeder & Security Test Runner Alignment:** Update `seedDemoData.mjs` to project into all three 14B collections; align `securityTestRunner.js` and `SecurityTestPanel.jsx` to initialize against strict rules without prohibited client-side deletions.
- [x] **15.3 Dead Code Removal & Search Error Recovery:** Remove confirmed dead functions (`normalizeProfile`, `updateCommentsCount`, `subscribeToBootstrapPosts`); wire active retry in `useUserSearch.js` and `Discover.jsx`.
- [x] **15.4 Firestore Rules Hardening:** Enforce strict `isValidPostCreate()` (exact 8 keys, bounds, timestamps); remove obsolete `users` fallback in `isValidCommentSchema` and `isValidActorProfile`; add comprehensive rules tests.
- [x] **15.5 Frontend Performance & UX:** Route-level `React.lazy` and `Suspense`; top-level `ErrorBoundary`; memoize `PostCard` and derived hook states; mitigate `Connections.jsx` tab-switch read storm; add confirmation for destructive connection actions.
- [x] **15.6 Test Expansion & Hygiene:** Add meaningful behavioral unit coverage for all domain services; consolidate cutover test files; update test fixtures to strict private schema.

### Milestone 16 — Minimal 1-to-1 Private Messaging (Delivered)

- [x] **16.1 Documentation & Test Count Reconciliation:** Reconcile stale test counts across documentation and establish Milestone 16 roadmap.
- [x] **16.2 Core Messaging Service & Unit Tests:** Implement `src/services/messageService.js` supporting canonical conversation IDs (`min_max`), conversation metadata, append-only message creation, cursor pagination, and mark-as-read; pure unit tests in `tests/unit/messageService.test.js`.
- [x] **16.3 Firestore Security Rules & Emulator Tests:** Enforce connection-gated authorization (`connections/{id}.status == "accepted"` required to send), participant-only access, immutable messages, self-only unread resets, 4-key `lastMessage` schema, and bidirectional transactional coupling (`getAfter()` / `existsAfter()`); expand emulator tests.
- [x] **16.4 Messaging Hooks & State Management:** Implement `useConversations.js` (conversation list with unread counters) and `useConversationMessages.js` (active thread listener, older message cursor pagination, error recovery).
- [x] **16.5 UI Implementation & Integration:** Implement responsive split-pane `/messages` view (`Messages.jsx`, `ConversationList`, `MessageThread`, `MessageBubble`, `MessageComposer`), add Navbar Messages item with unread badge, and wire "Message" CTAs from `PublicProfile.jsx` and `Connections.jsx`.
- [x] **16.6 Demo Data, Verification & Final Reconciliation:** Update seed script with deterministic demo conversations, verify browser smoke flow, confirm full test suites passing, and reconcile final documentation.

### Milestone 18 — Multi-Tenancy Foundation (Delivered)

*Note: Milestone 18 multi-tenancy requirements were delivered directly as part of the architecture baseline prior to Milestone 19 without a standalone Git release tag.*

- [x] **18.1 Multi-Tenant Domain & Schema:** Introduce `campusId` partitioning across all core models, profiles, and feeds.
- [x] **18.2 Firestore Multi-Tenant Security Rules:** Enforce campus boundary validation preventing cross-campus reads or writes.
- [x] **18.3 Client Context & Session Scoping:** Scope client queries and listeners by the authenticated student's campus.

### Milestone 19 — Student Communities (Delivered)

- [x] **19.1 Community Domain Foundation:** Community schema, seed infrastructure, and deterministic fixtures (`v19.1.0-community-domain-foundation`).
- [x] **19.2 Community Membership Authority:** Membership schema, role model (`member`, `moderator`, `admin`), and security rules (`v19.2.0-community-membership-authority`).
- [x] **19.3 Community Content Integration:** Community-scoped posts, comments, likes, and access controls (`v19.3.0-community-content-integration`).
- [x] **19.4 Community Client Services & Hooks:** Services and custom hooks for community lifecycle, memberships, and feeds (`v19.4.0-community-client-services-and-hooks`).
- [x] **19.5 Community UI Discovery Foundation:** Directory UI, search, category filters, and cards (`v19.5.0-community-ui-discovery-foundation`).
- [x] **19.6 Community Detail & Profile Experience:** Detail layout, overview tab, member lists, and join/leave interactions (`v19.6.0-community-detail-profile-experience`).
- [x] **19.7 Community Feed & Content UI:** Feed tab, composer, post cards, comments, and interactions (`v19.7.0-community-feed-content-ui`).
- [x] **19.8 Community Moderation & Management:** Moderation controls, member role management, and settings (`v19.8.0-community-moderation-management`).

### Milestone 20 — Campus Events (Delivered)

- [x] **20.1 Event Domain & Seeding:** Event entity definition, lifecycle statuses (`draft`, `published`, `cancelled`), and deterministic seeder (`v20.1.0-event-domain-seeding`).
- [x] **20.2 Event Security Rules:** Multi-tenant and visibility-tier authorization (`campus-public` vs `community-only`), temporal rules, and hard-delete authority (`v20.2.0-event-security-rules`).
- [x] **20.3 Event Client Services & Hooks:** Service layer and reactive hooks for events querying and subscriptions (`v20.3.0-event-client-services`).
- [x] **20.4 Event Discovery UI:** `/events` page with Upcoming and Past tabs, category filters, date sorting, and event cards (`v20.4.0-event-discovery-ui`).
- [x] **20.5 Event Detail & Community Integration:** Event detail page at `/events/:eventId` and community Events tab integration (`v20.5.0-event-detail-community-integration`).
- [x] **20.6 Event E2E Verification & Hardening:** End-to-end verification, temporal determinism, and membership integrity (`v20.6.0` through `v20.6.3`).

### Milestone 21 — Event RSVPs & Participation Discovery (Delivered)

- [x] **21.1 Event RSVP Domain & Seeding:** Exact 5-field schema (`id`, `eventId`, `campusId`, `userId`, `createdAt`), deterministic document IDs (`{eventId}_{userId}`), and seeder infrastructure (`v21.1.0-event-rsvp-domain-seeding`).
- [x] **21.2 Event RSVP Security Rules:** Multi-tenant rules, temporal creation validation, owner/non-owner read boundaries, immutable documents, and owner-only deletion with post-event removal authority (`v21.2.0-event-rsvp-security-rules`).
- [x] **21.3 Event RSVP Client Services & Hooks:** `eventRsvpService.js`, `useEventRsvp`, `useMyRsvps`, and resolution pipeline supporting queries Q1, Q2, and Q3 (`v21.3.0-event-rsvp-client-services-and-hooks`).
- [x] **21.4 Event Detail RSVP UI & Attention Handling:** Interactive RSVP button, attendee roster preview (up to 8 avatars with headcount), derived status badges, and attention container for inaccessible events (`v21.4.0` through `v21.4.3`).
- [x] **21.5 Participation Discovery Surfaces:** Dedicated Going tab on `/events`, card Going badges on all event cards and community Events tab, query/resolution retry actions, and context isolation across users/campuses (`v21.5.0-event-participation-discovery`, `v21.5.0-event-rsvp-discovery-surfaces`).
- [x] **21.6 RSVP E2E Verification & Documentation:** Deterministic RSVP reset helper (`resetEventRsvps`), comprehensive Playwright E2E coverage across all §14.3 scenarios, and complete documentation reconciliation (`v21.6.0-event-rsvp-e2e-documentation`).

### Milestone 22 — Event Lifecycle Management (Delivered)

- [x] **22.1 Event Lifecycle Domain Contract:** Exact 17-field event schema, 6 immutable fields (`id`, `campusId`, `communityId`, `createdBy`, `createdAt`, `visibility`), lifecycle statuses (`published`, `cancelled`), temporal boundaries, and unit tests (`v22.1.0-event-lifecycle-domain-contract`).
- [x] **22.2 Firestore Security Rules & Security Verification:** Revision 9 update Pathways A (upcoming general), B (ongoing metadata), and C (cancellation/republishing), community admin hard-delete authority for non-ongoing events, and 420 security rules regression tests (`v22.2.0-event-lifecycle-security-rules`).
- [x] **22.3 Event Management Hooks & Service Integration:** `eventService.js` management methods, `useEventManagement` hook, transactional update/delete operations, and service/hook unit tests (`v22.3.0-event-management-hooks-integration`).
- [x] **22.4 Event Management UI:** `EventManagementToolbar`, `EventEditModal`, `EventCancelModal`, `EventRepublishModal`, `EventDeleteModal`, integration into `EventDetail.jsx`, and UI unit test suite (`v22.4.0-event-management-ui`).
- [x] **22.5 E2E Verification & Documentation Reconciliation:** End-to-end verification across 10 lifecycle scenarios (`eventManagement.spec.js`), safe deterministic fixture/membership helpers, full test suite verification (835 unit tests, 420 rules tests, 69 Playwright E2E tests), and complete documentation reconciliation.

### Milestone 23 — Event Notifications & Resumable Cancellation Delivery (Delivered)

- [x] **23.1 Architecture Audit, Lifecycle Enforcement & Delivery Contract Proposal:** Establish event notification contracts (`event_rsvp`, `event_cancelled`), 14-field delivery ledger schema, two-way atomic cancellation handshake, and chunked delivery architecture (`CHUNK_SIZE = 8`).
- [x] **23.2 Firestore Security Rules & Delivery Ledger Security Authority:** Enforce delivery ledger permissions, atomic cancellation handshake, compare-and-set versioning (`checkpointVersion`), deterministic notification IDs (`cancel_${eventId}_${cycleId}`), recipient eligibility, and 486 security rules regression tests (`v23.2.0-event-notification-rules`).
- [x] **23.3 Resumable Event Notification Delivery Service & Client Integration:** Implement `eventNotificationDeliveryService.js` with deterministic `documentId()` query ordering, cursor progression (`startAfter`), zero-attendee handling, and interruption recovery (`v23.3.0-event-notification-service`).
- [x] **23.4 Presentation, Notification Preferences & E2E Verification:** Implement `EventDetail.jsx` cancellation delivery banner, notification preferences (`eventRsvps`, `eventCancellations`), durable `referenceTitle` rendering, and end-to-end regression journeys (`v23.4.0-event-notifications-ui`).
- [x] **23.4.1 Notification Attribution & Realistic Recovery Verification:** Preserve original cancelling actor attribution during secondary administrator resumption, implement realistic delivery interruption recovery (`v23.4.1-notification-attribution-recovery`).
- [x] **23.4.2 Delivery Ledger Point-Read Isolation Audit & Resolution:** Resolve cross-campus ledger existence-disclosure side-channel, enforce community leadership check for nonexistent ledger reads, and prevent creator authorization bypass (`v23.4.2-delivery-ledger-point-read-isolation`).
- [x] **23.5 E2E Verification & Documentation Reconciliation:** Comprehensive E2E regression coverage across multi-chunk boundaries, deleted notification non-recreation, republishing supersession, and cycle-isolated repeat cancellation; reconcile all project documentation; verify complete test suites (880 unit tests across 43 files, 486 rules tests across 16 suites, 74 Playwright E2E tests across 12 spec files).

## Proposed next engineering milestones

### 1. Trusted event processing

- [ ] Evaluate whether notification volume and event types justify Cloud Functions.
- [ ] If justified, move connection notification generation into idempotent server-side triggers.
- [ ] Preserve recipient-only notification reads and read-state updates.
- [ ] Add emulator coverage for trigger retries and duplicate delivery.

### 2. Search infrastructure scaling

- [ ] Keep client-side `directoryIndex` projection search for the present application scale.
- [ ] Revisit external search indexing (e.g., Algolia or Typesense) only when actual directory size or observed query latency demonstrates a concrete need.

## Explicitly deferred product ideas

These ideas are not commitments for the next release:

- image and file uploads;
- post sharing and bookmarks;
- marketplace or internship board;
- admin dashboard;
- dark mode and theme switching;
- rich media and advanced profile customization;
- event ticketing, payment processing, or QR code check-in;
- event capacity caps, waitlists, or attendance quotas;
- verified attendance tracking or check-in verification;
- organizer removal/management of other students' RSVPs;
- calendar export/sync (iCal, Google Calendar).

They should be reconsidered only after the reliability, privacy, and read-path milestones have evidence supporting them.
