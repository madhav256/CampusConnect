# CampusConnect Architecture

**Status:** Current implementation reference (Milestone 24 Delivered)

This document describes the architecture that exists in the repository today. It does not describe proposed messaging, media storage, search infrastructure, or other deferred work.

## Overview

CampusConnect is a React/Vite single-page application for university student networking. The browser is the primary application runtime, Firebase Authentication provides identity, and Cloud Firestore provides the live domain data store. Firestore Security Rules are the authorization boundary for client-originated reads and writes.

Under Milestone 24 (Capped Events and FIFO Waitlists), client applications coordinate event capacity, waitlist queues, and seat offers with a trusted server-side microservice architecture implemented using Google Cloud Functions v2 (HTTPS callables, Cloud Tasks queue workers, scheduled cron sweepers, and Firestore triggers). In accordance with **Option A (Firebase Spark Plan, Local Emulators, ₹0 Cloud Spend)**, these trusted backend services run locally against the Firebase Emulator Suite (`demo-campusconnect-rules-test`).

The active request path is:

```text
src/main.jsx
  └─ StrictMode
     └─ AuthProvider
        └─ App / React Router
           └─ protected page
              └─ feature component and/or custom hook
                 ├─ service module ──▶ Cloud Firestore / Firebase Auth
                 └─ callable function ──▶ Google Cloud Functions v2 (Local Emulator)
```

## Active technology stack

| Layer | Implementation |
| --- | --- |
| Frontend | React 19 with Vite 8 |
| Language | JavaScript with JSX |
| Routing | React Router DOM 7 |
| Styling | Tailwind CSS 4 with custom `@theme` tokens |
| Interaction | Motion for React and Lucide React |
| Identity | Firebase Authentication, email/password |
| Database | Cloud Firestore |
| Server runtime | Google Cloud Functions v2 (HTTPS Callables, Cloud Tasks Workers, Scheduler Sweepers, Firestore Triggers) |
| Hosting | Firebase Hosting serving the Vite `dist` output |
| Admin tooling | Firebase Admin SDK seeding script and local microservice workers |
| Operating mode | **Option A**: Firebase Spark plan, local Firebase Emulator Suite, zero cloud spend |
| Quality checks | ESLint; production Vite build; 1,032 Vitest unit tests across 55 files + 16 Cloud Functions boundary tests (`npm run test:unit`); 579 Firestore Emulator security rules tests across 16 suites (`npm run test:rules`); Playwright E2E test suite with 76 passing tests across 16 spec files (`npm run test:e2e`); development-only Firestore security audit panel |

Firebase Storage is not part of the active client architecture. The Firebase configuration contains a storage-bucket value because it is part of the standard web configuration shape, but the application does not initialize the Storage SDK or upload files.

## Application entry and routing

`src/main.jsx` mounts the application with `StrictMode` and `AuthProvider`.

`src/App.jsx` owns the route table:

| Route | Access | Page |
| --- | --- | --- |
| `/` | Public | Login and optional demo login |
| `/register` | Public | Account registration |
| `/dashboard` | Authenticated | Real-time campus feed |
| `/profile` | Authenticated | Current user's editable profile |
| `/discover` | Authenticated | Bounded student search |
| `/communities` | Authenticated | Campus-scoped community discovery |
| `/communities/:communityId` | Authenticated | Community detail, profile, discussion feed, and Events tab with Going badge integration |
| `/events` | Authenticated | Campus-wide event discovery, Going tab (personal RSVPs), category/community filtering, capacity indicators, and attention/retry error states |
| `/events/:eventId` | Authenticated | Event detail, sponsoring community integration, RSVP lifecycle interaction, real-time attendee roster, capacity coordinator, waitlist modal, seat claim banner, and cancellation display |
| `/users/:uid` | Authenticated | Public profile and connection CTA |
| `/connections` | Authenticated | Accepted connections and pending requests |
| `/messages` | Authenticated | 1-to-1 private messaging overview |
| `/messages/:conversationId` | Authenticated | Active 1-to-1 private message thread |
| `/notifications` | Authenticated | Scoped notification inbox |
| `/settings` | Authenticated | Privacy, notification preferences (`eventWaitlistOffers`), and sign out |
| `*` | Public/auth-aware | Not-found page |

`ProtectedRoute` waits for authentication initialization and redirects unauthenticated users to `/`, preserving the attempted location for the login flow.

There is no separate route configuration folder, layout router, sidebar system, marketplace route, or admin route in the active application.

## Source tree

```text
src/
├── App.jsx
├── main.jsx
├── index.css
├── components/
│   ├── community/        # CommunityCard, CommunityCategoryBadge, CommunityGrid, CommunityHero, CommunityMembersPreview, CommunityModerationPanel, CommunityPostComposer, CommunityPostFeed
│   ├── dev/              # Development-only security audit panel
│   ├── events/           # EventCard, EventCategoryBadge, EventStatusBadge, EventFilterBar, EventGrid, EventComposerModal, EventRsvpButton, RsvpStatusBadge, EventAttendeePreview, EventManagementToolbar, EventEditModal, EventCancelModal, EventRepublishModal, EventDeleteModal, CapacityIndicator, SeatClaimBanner, WaitlistModal
│   ├── feed/             # Feed, posts, comments, composers
│   ├── layout/           # Navbar, PageContainer, Section
│   ├── messages/         # ConversationList, ConversationItem, MessageThread, MessageBubble, MessageComposer, DisconnectedNotice
│   ├── notifications/    # NotificationItem
│   ├── search/           # StudentCard
│   └── ui/               # Button, Card, Avatar, Input, Textarea, EmptyState, ErrorBoundary
├── contexts/             # AuthContext and its context value
├── data/                 # Domain schemas, validators, constants, and deterministic demo data (including eventCapacities, eventWaitlistSlots, eventWaitlistMembers, eventWaitlistContinuations)
├── firebase/             # Firebase client initialization
├── hooks/                # Auth, campus, community, and event hooks (including useEvents, useEvent, useEligibleCommunities, useEventRsvp, useMyRsvps, useEventAttendees, useEventManagement, useEventCapacity, useEventWaitlist)
├── pages/                # Route-level screens (including Events.jsx, EventDetail.jsx, CommunityDetail.jsx, Settings.jsx)
├── server/               # Cloud Functions v2 and microservice workers (index.js, callableFunctions.js, continuationWorker.js, expirySweeper.js, outboxWorker.js, queueHeadNormalization.js, taskDispatcher.js)
├── services/             # Firebase Auth/Firestore operations (including eventService.js, eventRsvpService.js, eventCapacityService.js, eventWaitlistService.js, communityService.js)
└── utils/                # Development security test runner
```

## Layer responsibilities

### Entry and authentication context

`AuthContext` owns the current authenticated user, authentication loading state, authentication errors, and the login, signup, logout, and password-reset commands. It configures browser-local Firebase Auth persistence and subscribes to `onAuthStateChanged`.

When an authenticated user is observed, the context ensures corresponding Firestore documents exist across the locked three-collection architecture (`users/{uid}`, `publicProfiles/{uid}`, and `directoryIndex/{uid}`). Private account settings and public profile data are strictly decoupled at the Firestore document and security rule layer.

### Pages

Pages compose the authenticated experience and own page-level state such as form values, active tabs, and feedback messages. They do not implement the Firestore data model themselves.

The main page responsibilities are:

- `Login` and `Register`: form validation and Auth commands.
- `Dashboard`: authenticated shell around `Feed`.
- `Profile`: profile display/edit form.
- `PublicProfile`: point-read profile display (from `publicProfiles/{uid}`) and relationship CTA.
- `Discover`: debounced student search against `directoryIndex` and result grid.
- `Connections`: relationship tabs and page-local person cards.
- `Messages`: authenticated 1-to-1 messaging overview and active thread interaction with responsive split-pane desktop (≥1024px) and single-view mobile (<1024px) layouts.
- `Events`: campus-wide event discovery, Going tab (personal RSVPs), category/community filtering, capacity indicators, and attention/retry error states.
- `EventDetail`: event overview, sponsoring community link, RSVP lifecycle, capacity indicator, waitlist modal, seat claim banner, and cancellation display.
- `Notifications`: all/unread filters, notification actions, and event/waitlist offer CTAs.
- `Settings`: discoverability, notification preferences (`connectionRequests`, `connectionAccepted`, `eventRsvps`, `eventCancellations`, `eventWaitlistOffers`), sign out, and development audit panel.
- `NotFound`: route fallback.

### Components

Feature components render domain UI and receive service-backed state through hooks or page props. Reusable UI components provide the current visual and accessibility patterns without introducing a global component framework.

Components do not call Firebase directly. Firestore and Auth calls are isolated in `src/services/`.

### Hooks

Hooks bind the service layer to React lifecycle and local state. Subscription hooks register `onSnapshot` listeners inside `useEffect` and return unsubscribe functions when components unmount.

Active hooks include:

- `useAuth`
- `usePosts`
- `useComments`
- `usePostLike`
- `useUserProfile`
- `useSettings`
- `useUserSearch`
- `useConnectionState`
- `useUserRelationships`
- `useNotifications`
- `useConversations`
- `useConversationMessages`
- `useCommunities`
- `useCommunity`
- `useCommunityMembers`
- `useEvents`
- `useEvent`
- `useEligibleCommunities`
- `useEventRsvp`
- `useMyRsvps`
- `useEventAttendees`
- `useEventManagement`
- `useEventCapacity`
- `useEventWaitlist`

### Services

The service modules are the client-side Firebase boundary:

- `authService.js`: Firebase Auth persistence, subscriptions, login, signup, logout, reset, and Auth error normalization.
- `userService.js`: cutover management, private profile and settings operations (`users/{uid}`), public profile operations (`publicProfiles/{uid}`), directory index queries (`directoryIndex`), normalization, self-healing projection logic, and bounded user-directory caching.
- `postService.js`: post creation, newest-post subscription, deletion, and comment-counter updates.
- `commentService.js`: authoritative profile lookup from `publicProfiles/{uid}`, canonical comment snapshots, comment subscriptions, plus batched comment create/delete and parent counter updates.
- `likeService.js`: atomic like/unlike transactions and the current user's like subscription.
- `connectionService.js`: canonical relationship IDs, relationship transactions, notifications associated with connection transitions, and relationship subscriptions.
- `notificationService.js`: recipient-scoped notification subscription, normalization, read updates, batch mark-as-read, and dismissal.
- `messageService.js`: canonical conversation IDs, connection-gated message send transactions, conversation subscriptions, active thread listeners, cursor pagination, and mark-as-read updates.
- `eventService.js`: authoritative event lifecycle management, CRUD operations, query sorting, category filtering, and community integration.
- `eventRsvpService.js`: event participation intent operations, point reads, Going tab queries, and roster queries.
- `eventCapacityService.js`: capacity coordinator point lookups, real-time subscriptions, direct admission transactions, and waitlist join transactions.
- `eventWaitlistService.js`: waitlist slot and member point lookups, subscriptions, non-head voluntary withdrawals, and HTTPS callable invocations (`claimWaitlistOffer`, `declineWaitlistOffer`, `leaveWaitlist`).

### Server layer (`src/server/`)

The server layer provides trusted backend microservice operations conforming strictly to ADR-024 Revision 33:

- `index.js`: registered Cloud Functions v2 exports (HTTPS callables, Tasks queue workers, scheduled sweepers, and Firestore triggers).
- `callableFunctions.js`: privileged HTTPS callables with authentication and multi-tenant authorization guards (`cancelRsvpWithPromotion`, `claimWaitlistOffer`, `declineWaitlistOffer`, `leaveWaitlist`, `promoteWaitlistCandidates`, `fastForwardWaitlistHead`).
- `continuationWorker.js`: durable task executor processing `eventWaitlistContinuations` with lease fencing, candidate promotions, and outbox staging.
- `expirySweeper.js`: scheduled 1-minute sweeper processing expired waitlist offers and checkpointing progress in `systemWaitlistJobs`.
- `outboxWorker.js`: event-driven worker delivering in-app `event_waitlist_offer` notifications from `eventWaitlistOutbox`.
- `queueHeadNormalization.js`: queue normalization engine evaluating the 4-outcome discriminated union and skipping terminal holes.
- `taskDispatcher.js`: Cloud Tasks dispatcher for asynchronous durable continuations.

## State and data-flow patterns

### Real-time listeners

The application selectively uses Firestore `onSnapshot` for:

- the newest feed posts;
- expanded post comments;
- the current user's like document for a post;
- the current user's connection relationships;
- a single relationship between two users;
- the current user's active conversations;
- the active thread's newest messages;
- the current user's profile/settings;
- the current user's notifications;
- an event's capacity coordinator document (`eventCapacities/{eventId}`);
- the current user's waitlist member document (`eventWaitlistMembers/{eventId}_{userId}`);
- the current user's assigned waitlist slot (`eventWaitlistSlots/{eventId}_{seq}`).

Each subscription is owned by a hook or service caller and is cleaned up on unmount.

### Bounded reads and caching

The current read limits are deliberate MVP safeguards:

- feed: newest 10 posts loaded initially with a real-time listener for newer posts, plus cursor-based pagination for older posts;
- messaging: newest 25 messages loaded initially for an active thread with real-time updates, plus cursor pagination for older messages; conversations list bounded to newest 50 active conversations ordered by updatedAt;
- directory: newest 100 discoverable users fetched from `directoryIndex` ordered by `updatedAt`;
- notifications: newest 30 notifications ordered by `createdAt`;
- search: 300 ms input debounce, followed by client-side filtering across display name, department, year, and skills over discoverable directory documents;
- directory result cache: two-minute module-level cache in `userService.js`. External search infrastructure will be considered only when actual directory growth or observed query latency demonstrates a concrete need.

### Atomic writes

- Registration and self-heal: atomic write batch across `users/{uid}`, `publicProfiles/{uid}`, and `directoryIndex/{uid}` (when discoverable).
- Settings updates: atomic batch syncing `isDiscoverable` in `users/{uid}` with creation or deletion of `directoryIndex/{uid}`.
- Likes: `runTransaction` creating/deleting `posts/{postId}/likes/{uid}` and updating `posts.likesCount` together.
- Comments: `writeBatch` creating/deleting a comment and updating `posts.commentsCount` together.
- Connection requests, acceptance, rejection, cancellation, and removal use transactions.
- Connection transactions may create or delete deterministic notification documents in the same transaction.
- Messaging: `runTransaction` in `sendMessage()` atomically creating or updating `conversations/{canonicalConnectionId}` alongside creating the corresponding child message document in `conversations/{canonicalConnectionId}/messages/{messageId}`.
- Direct Event Admission: `runTransaction` creating `eventRsvps/{eventId}_{uid}` and incrementing `eventCapacities/{eventId}.confirmedCount` under concurrency checks.
- Waitlist Join: `runTransaction` creating `eventWaitlistSlots/{eventId}_{seq}`, `eventWaitlistMembers/{eventId}_{uid}`, and incrementing `eventCapacities/{eventId}.waitlistCount` and `nextSequence`.
- Non-Head Waitlist Withdrawal: `runTransaction` marking `eventWaitlistSlots` as `withdrawn`, deleting `eventWaitlistMembers`, and decrementing `eventCapacities.waitlistCount`.

The client uses these atomic paths, while Firestore Rules and GCFv2 backend callables remain the authoritative authorization boundaries.

## Active Firestore domains

The active collections are:

- `users/{uid}`: private authority (exact 6 base fields: `uid`, `email`, `isDiscoverable`, `notificationPreferences`, `createdAt`, `updatedAt`; plus optional `campusId`), owner-only read and write;
- `publicProfiles/{uid}`: public profile authority (exact 8 base fields: `uid`, `displayName`, `photoURL`, `bio`, `department`, `year`, `skills`, `socialLinks`; plus optional `campusId`), authenticated read, owner update;
- `directoryIndex/{uid}`: search and discoverability projection (exact 7 base fields: `uid`, `displayName`, `photoURL`, `department`, `year`, `skills`, `updatedAt`; plus optional `campusId`), authenticated read, maintained atomically when `isDiscoverable == true`;
- `posts/{postId}`: text feed posts;
- `posts/{postId}/comments/{commentId}`: comments;
- `posts/{postId}/likes/{uid}`: individual likes;
- `connections/{canonicalConnectionId}`: one relationship document per pair;
- `users/{uid}/notifications/{notificationId}`: recipient-scoped notifications for connection requests/acceptances, event RSVPs, event cancellations, and waitlist offers;
- `conversations/{canonicalConnectionId}`: 1-to-1 conversation metadata between connected peers;
- `conversations/{canonicalConnectionId}/messages/{messageId}`: append-only immutable message subcollection;
- `campuses/{campusId}`: authoritative campus metadata for multi-tenancy and the CampusNest domain;
- `communities/{communityId}`: authoritative campus community metadata defining student clubs, societies, and cohorts;
- `communityMembers/{membershipId}`: authoritative community membership records linking students to campus communities with role-based security authority;
- `events/{eventId}`: authoritative campus event and student activity records (locked 17 fields);
- `eventRsvps/{eventId}_{userId}`: authoritative event participation intent records (locked 5 fields);
- `eventNotificationDeliveries/{eventId}`: authoritative event notification delivery ledger records for resumable cancellation fan-out (locked 14 fields);
- `eventCapacities/{eventId}`: authoritative capacity coordinator records tracking headcount, offers, and sequence counters (locked 10 fields);
- `eventWaitlistSlots/{eventId}_{sequenceNumber}`: authoritative FIFO queue slot audit log records (locked 10 fields);
- `eventWaitlistMembers/{eventId}_{userId}`: authoritative private student waitlist membership index records (locked 8 fields);
- `eventWaitlistContinuations/{eventId}`: durable background continuation task staging records (locked 14 fields, server-only);
- `eventWaitlistOutbox/{eventId}_{candidateSequence}`: durable notification outbox records (locked 9 fields, server-only);
- `systemWaitlistJobs/{jobId}`: sweeper job execution checkpoints (server-only).

The full field-level schema and current rule behavior are documented in [FIRESTORE_SCHEMA.md](FIRESTORE_SCHEMA.md).

## Capped Events & FIFO Waitlists Architecture (Milestone 24 Delivered — ADR-024 Revision 33 Authoritative)

Milestone 24 implements high-concurrency event capacity coordination and deterministic FIFO waitlist queues, resolving the capacity limit and overbooking challenges inherent in open event RSVPs.

```text
Student Registration Request
            │
            ▼
    Event Capped?
     ├── No ──▶ Direct RSVP (Uncapped Open Registration)
     └── Yes ──▶ Check Capacity Coordinator (eventCapacities/{eventId})
                   │
                   ├── Vacancy Available & Waitlist Empty?
                   │     └── Yes ──▶ Direct Admission Transaction
                   │                   ├─ Write eventRsvps/{eventId}_{userId}
                   │                   └─ Increment eventCapacities.confirmedCount
                   │
                   └── Event Full or Waitlist Active?
                         └── Yes ──▶ Waitlist Join Transaction
                                       ├─ Allocate sequenceNumber = nextSequence
                                       ├─ Write eventWaitlistSlots/{eventId}_{seq} (waiting)
                                       ├─ Write eventWaitlistMembers/{eventId}_{userId} (waiting)
                                       └─ Increment waitlistCount & nextSequence
```

### 1. Three-Tier Data Model & Canonical Root Collections

1. **Coordinator Document (`eventCapacities/{eventId}`):**
   - Single point of synchronization per event, tracking `confirmedCount`, `offeredCount`, `waitlistCount`, `headSequence`, and `nextSequence`.
   - Maintained atomically during direct admissions, waitlist joins, voluntary withdrawals, and server promotions.
2. **Queue Slot Log (`eventWaitlistSlots/{eventId}_{sequenceNumber}`):**
   - Immutable audit trail of every queue position assigned.
   - Keyed deterministically by `{eventId}_{sequenceNumber}` with monotonic integer sequence numbers starting at 1.
   - Lifecycle statuses: `waiting`, `offered`, `claimed`, `declined`, `expired`, `withdrawn`.
3. **Private Queue Index (`eventWaitlistMembers/{eventId}_{userId}`):**
   - Student-indexed pointer providing efficient `O(1)` point lookups and subscriptions for a student's active queue position on a specific event.
   - Keyed deterministically by `{eventId}_{userId}`.
   - Strictly private to the student and parent event leaders; collection queries (`list`) are prohibited to protect student privacy.

### 2. Client vs. Server Authority Boundaries

To maintain strict data integrity without exposing cross-student mutation authority to client tokens, ADR-024 Revision 33 delineates client-originating and server-originating pathways:

- **Client-Originated Mutations (Governed by Firestore Security Rules):**
  - *Direct Admission (Pathway 1):* Admitted into a vacancy when `confirmedCount + offeredCount < capacity` and `waitlistCount == 0`.
  - *Waitlist Join (Pathway 2):* Appended to the tail of the queue when full or waitlist is active, allocating `nextSequence`.
  - *Non-Head Waiting Withdrawal (Pathway 5 Non-Head):* A waiting candidate whose `sequenceNumber > headSequence` may withdraw directly, marking their slot `withdrawn`, deleting their member record, and decrementing `waitlistCount`.
  - *Coordinator Creation (Pathway 13):* Created in an atomic batch with event creation by authorized community leaders.
- **Server-Originated Mutations (Executed via GCFv2 HTTPS Callables & Workers):**
  - *Attendee Cancellation with Promotion (Pathway 4):* When a confirmed attendee cancels on a full event with a waiting queue, the server callable `cancelRsvpWithPromotion` removes the RSVP and immediately promotes the head candidate or dispatches a continuation.
  - *Offer Claiming (Pathway 8):* An offered candidate claims their seat via `claimWaitlistOffer`, transitioning slot to `claimed`, incrementing `confirmedCount`, decrementing `offeredCount`, and creating confirmed `eventRsvps`.
  - *Offer Declining (Pathway 9):* An offered candidate declines via `declineWaitlistOffer`, transitioning slot to `declined`, decrementing `offeredCount`, and promoting the next waiting candidate.
  - *Head-of-Queue Withdrawal (Pathway 5 Head):* A waiting candidate at `sequenceNumber == headSequence` calls `leaveWaitlist`, prompting the server to normalize the queue head and promote the next candidate.
  - *Candidate Promotion (Pathway 7B):* Community leaders or system processes promote candidates into available vacancies via `promoteWaitlistCandidates`.
  - *Fast-Forward Head Pointer (Pathway 12):* Recovery helper `fastForwardWaitlistHead` advances the head pointer past terminal holes.

### 3. Queue Head Normalization Engine (`normalizeQueueHead`)

When evaluating candidates for promotion, the queue head may encounter "holes" left by candidates who withdrew, expired, or declined while in the queue. The normalization engine implements ADR-024 Revision 33 Section 6.2.2 as a 4-outcome discriminated union:

1. `normal_waiting`: Candidate at head sequence exists with status `waiting`. Candidate is eligible for promotion.
2. `terminal_hole`: Slot at head sequence exists in a terminal state (`withdrawn`, `declined`, `expired`, `claimed`). Head pointer advances past the hole without consuming an offer.
3. `out_of_bounds`: Head sequence has reached or exceeded `nextSequence`. The queue is completely empty.
4. `unexpected_status`: Slot exists with an unexpected status (e.g. `offered`). Normalization halts to avoid skipping in-flight offers.

The engine iterates iteratively or in batch, skipping holes until a valid waiting candidate or end-of-queue is reached.

### 4. Asynchronous Continuations & Failure Isolation

When promotions or cascade processing require multi-document operations exceeding interactive latency budgets:
- Producers transactionally write a staging document to `eventWaitlistContinuations/{eventId}` with `status: 'pending'`, generation counter, and vacancy requirements.
- The producer dispatches a Cloud Task to `processWaitlistContinuationTask` (us-central1) with rate-limiting and retry configurations.
- The worker claims the continuation using lease fencing (`leaseWorkerId`, `leaseExpiresAt`), processes the promotions, and marks the task `completed`.
- If task enqueue fails or a task is lost, the 1-minute fallback scheduler `processWaitlistContinuations` sweeps pending continuations to guarantee eventual consistency.

### 5. Outbox Pattern for Notifications

To decouple transactional seat offers from notification delivery:
- Promoting transactions write an outbox record to `eventWaitlistOutbox/{eventId}_{candidateSequence}`.
- A Firestore document-created trigger `deliverWaitlistOfferNotification` consumes the outbox record, checks the recipient's `eventWaitlistOffers` preference, and writes the `event_waitlist_offer` notification to `users/{recipientId}/notifications/`.
- Notification deep-links to `/events/{eventId}` with CTA "View Event", where the active `SeatClaimBanner` displays the remaining offer window and Claim/Decline controls.

### 6. Operating Mode Invariant: Option A

Under Option A, the entire Milestone 24 architecture is executed and verified strictly locally:
- Firebase Spark plan is retained (₹0 cloud spend).
- Cloud Functions v2 and Cloud Tasks run inside the local Firebase Emulator Suite on project `demo-campusconnect-rules-test`.
- No credit card or paid billing is linked.
- The unapproved Cloudflare Worker alternative (`ADR-025`) remains `PROPOSED — PENDING EXPLICIT APPROVAL`.

## Security model

The browser is treated as untrusted. Firestore Rules enforce the active authorization model, including:

- authenticated access to application data where permitted;
- strict private user document schema (6 base fields plus optional `campusId`), owner-only access, immutable identity fields (`uid`, `email`, `createdAt`), and strict update constraints;
- strict public profile schema (8 base fields plus optional `campusId`), authenticated reads, and owner-only updates;
- directory index projection synced atomically to `isDiscoverable`;
- author-restricted post deletion and no generic post editing;
- exact like document schemas and transaction-coupled like counters;
- canonical comment snapshots, denied comment updates, and child/parent counter coupling;
- user-owned like creation/deletion;
- canonical connection IDs and participant arrays;
- recipient-only notification list and point reads;
- recipient-only routine notification read-state updates, with narrowly validated acceptance refreshes and sender-side cancellation cleanup;
- connection state transitions and notification transaction relationships;
- connection gate (`status == 'accepted'`) for starting threads and sending messages;
- immutable conversation participants, creation time, and message history;
- bidirectional transactional coupling preventing message or conversation summary forgery;
- tenant-isolated event reads and creation (`resource.data.campusId == getUserCampusId()`);
- strict 17-field event document schema with six immutable fields (`id`, `campusId`, `communityId`, `createdBy`, `createdAt`, `visibility`) and bounded title length (3–100 characters);
- community leadership gate for event creation (`isCommunityModeratorOrAdmin(communityId)`);
- two-tier event visibility enforcement (`campus_public` for campus students, `community_only` for active members);
- strict chronological invariant (`endAt >= startAt`) and allowed stored lifecycle transitions (`published`, `cancelled`);
- event hard deletion permitted exclusively for community administrators within matching campus for upcoming published or cancelled events;
- root collection `eventRsvps/{eventId}_{userId}` with strict 5-field schema (`id`, `eventId`, `campusId`, `userId`, `createdAt`);
- RSVP creation gated by matching campus, upcoming event (`request.time < event.startAt`), published status, and parent event readability;
- immutable RSVP documents (`allow update: if false;`);
- owner-only RSVP deletion authority (`resource.data.userId == request.auth.uid`), preserved after event ends, after cancellation, or after parent deletion;
- delivery ledger collection `eventNotificationDeliveries/{eventId}` with locked 14-field schema, atomic cancellation handshake, and compare-and-set progression;
- delivery ledger point-read security isolation (M23.4.2) preventing cross-campus existence disclosure side-channels;
- capacity coordinator collection `eventCapacities/{eventId}` with locked 10-field schema, direct admission invariants, waitlist join invariants, and non-head withdrawal constraints;
- waitlist slots collection `eventWaitlistSlots/{slotId}` with locked 10-field schema, owner-only creation at queue tail, withdrawal restricted to `sequenceNumber > headSequence`, and owner/leader-only read boundaries;
- waitlist members collection `eventWaitlistMembers/{memberId}` with locked 8-field schema, reciprocal slot coupling, owner-only deletion for non-head withdrawals, private point reads, and list query prohibition;
- server-only collections `eventWaitlistContinuations/{eventId}`, `eventWaitlistOutbox/{outboxId}`, and `systemWaitlistJobs/{jobId}` locked unconditionally against client reads and writes (`allow read, write: if false;`).

## Demo and deployment

Firebase Hosting serves the Vite build from `dist` and rewrites application routes to `index.html`.

The recruiter demo uses a normal Firebase Auth account configured through `VITE_DEMO_USER_EMAIL` and `VITE_DEMO_USER_PASSWORD`. The Admin SDK script in `scripts/seedDemoData.mjs` resolves or creates that account and writes deterministic demo profiles, posts, comments, likes, connections, notifications, communities, events, event RSVPs, capacity coordinators, and waitlist slots.

## Current limitations

- 1,032 unit tests across 55 files (+ 16 Cloud Functions boundary tests = 1,048 total), 579 Firestore Emulator rules tests across 16 suites (including TC-01 through TC-91), and 16 Playwright E2E spec files (76 passing tests) are active.
- Email verification is not required after sign-up.
- Non-discoverable students are excluded from `directoryIndex` search queries; authenticated direct public profile reads (`/users/:uid`) remain accessible by design.
- Notifications are bounded to the newest 30 items rather than cursor-paginated.
- No media upload or Firebase Storage integration exists.
- No post editing, post sharing, post search, bookmarks, marketplace, or direct account deletion exists.
- Within the Event domain, ticketing, QR check-in, verified attendance, payment processing, calendar sync, push notifications, and event comments remain deferred.
- Cloud Functions v2 and Cloud Tasks run locally under Firebase Emulators (Option A, ₹0 spend); production cloud deployment remains deferred pending cloud plan decisions.

## Deferred architecture, not current implementation

The following are possible later milestones and should not be treated as active architecture:

- production cloud deployment of Cloud Functions v2 and Cloud Tasks (pending Blaze plan or zero-cost edge alternatives per unapproved ADR-025);
- media storage with separate Storage Rules and lifecycle cleanup;
- QR check-in, ticketing, attendance verification, and calendar synchronization.
