# CampusConnect Architecture

**Status:** Current implementation reference (Milestone 23 Delivered)

This document describes the architecture that exists in the repository today. It does not describe proposed messaging, media storage, search infrastructure, or other deferred work.

## Overview

CampusConnect is a React/Vite single-page application for university student networking. The browser is the application runtime, Firebase Authentication provides identity, and Cloud Firestore provides the live domain data store. Firestore Security Rules are the authorization boundary for client-originated reads and writes.

The active request path is:

```text
src/main.jsx
  └─ StrictMode
     └─ AuthProvider
        └─ App / React Router
           └─ protected page
              └─ feature component and/or custom hook
                 └─ service module
                    ├─ Firebase Authentication
                    └─ Cloud Firestore
```

The UI does not use a custom HTTP API or server-rendered backend. Firebase Admin SDK is used only by the local/demo seeding script, not by the browser application.

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
| Hosting | Firebase Hosting serving the Vite `dist` output |
| Admin tooling | Firebase Admin SDK seeding script |
| Quality checks | ESLint; production Vite build; 880 Vitest unit tests across 43 files (`npm run test:unit`); 486 Firestore Emulator security rules tests across 16 suites (`npm run test:rules`); Playwright E2E test suite with 74 passing tests across 12 spec files (`npm run test:e2e`); development-only Firestore security audit panel |

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
| `/events` | Authenticated | Campus-wide event discovery, Going tab (personal RSVPs), category/community filtering, and attention/retry error states |
| `/events/:eventId` | Authenticated | Event detail, sponsoring community integration, RSVP lifecycle interaction, real-time attendee roster, and cancellation display |
| `/users/:uid` | Authenticated | Public profile and connection CTA |
| `/connections` | Authenticated | Accepted connections and pending requests |
| `/messages` | Authenticated | 1-to-1 private messaging overview |
| `/messages/:conversationId` | Authenticated | Active 1-to-1 private message thread |
| `/notifications` | Authenticated | Scoped notification inbox |
| `/settings` | Authenticated | Privacy, notification preferences, and sign out |
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
│   ├── community/        # CommunityCard, CommunityCategoryBadge, CommunityGrid, CommunityHero, CommunityMembersPreview, CommunityPostComposer, CommunityPostFeed
│   ├── dev/              # Development-only security audit panel
│   ├── events/           # EventCard, EventCategoryBadge, EventStatusBadge, EventFilterBar, EventGrid, EventComposerModal, EventRsvpButton, RsvpStatusBadge, EventAttendeePreview, EventManagementToolbar, EventEditModal, EventCancelModal, EventRepublishModal, EventDeleteModal
│   ├── feed/             # Feed, posts, comments, composers
│   ├── layout/           # Navbar, PageContainer, Section
│   ├── messages/         # ConversationList, ConversationItem, MessageThread, MessageBubble, MessageComposer, DisconnectedNotice
│   ├── notifications/    # NotificationItem
│   ├── search/           # StudentCard
│   └── ui/               # Button, Card, Avatar, Input, Textarea, EmptyState
├── contexts/             # AuthContext and its context value
├── data/                 # Deterministic demo data, campus/community/event/RSVP fixtures, and ID whitelists
├── firebase/             # Firebase client initialization
├── hooks/                # Auth, campus, community, and event hooks (including useEvents, useEvent, useEligibleCommunities, useEventRsvp, useMyRsvps, useEventAttendees, useEventManagement)
├── pages/                # Route-level screens (including Events.jsx, EventDetail.jsx, CommunityDetail.jsx)
├── services/             # Firebase Auth/Firestore operations (including eventService.js, eventRsvpService.js, communityService.js)
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
- `Notifications`: all/unread filters and notification actions.
- `Settings`: discoverability, notification preferences, sign out, and development audit panel.
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

### Services

The service modules are the Firebase boundary:

- `authService.js`: Firebase Auth persistence, subscriptions, login, signup, logout, reset, and Auth error normalization.
- `userService.js`: cutover management, private profile and settings operations (`users/{uid}`), public profile operations (`publicProfiles/{uid}`), directory index queries (`directoryIndex`), normalization, self-healing projection logic, and bounded user-directory caching.
- `postService.js`: post creation, newest-post subscription, deletion, and comment-counter updates.
- `commentService.js`: authoritative profile lookup from `publicProfiles/{uid}`, canonical comment snapshots, comment subscriptions, plus batched comment create/delete and parent counter updates.
- `likeService.js`: atomic like/unlike transactions and the current user's like subscription.
- `connectionService.js`: canonical relationship IDs, relationship transactions, notifications associated with connection transitions, and relationship subscriptions.
- `notificationService.js`: recipient-scoped notification subscription, normalization, read updates, batch mark-as-read, and dismissal.
- `messageService.js`: canonical conversation IDs, connection-gated message send transactions, conversation subscriptions, active thread listeners, cursor pagination, and mark-as-read updates.

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
- the current user's notifications.

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

The client uses these atomic paths, while Firestore Rules remain the final authorization boundary.

## Active Firestore domains

The active collections are:

- `users/{uid}`: private authority (exact 6 base fields: `uid`, `email`, `isDiscoverable`, `notificationPreferences`, `createdAt`, `updatedAt`; plus optional `campusId`), owner-only read and write;
- `publicProfiles/{uid}`: public profile authority (exact 8 base fields: `uid`, `displayName`, `photoURL`, `bio`, `department`, `year`, `skills`, `socialLinks`; plus optional `campusId`), authenticated read, owner update;
- `directoryIndex/{uid}`: search and discoverability projection (exact 7 base fields: `uid`, `displayName`, `photoURL`, `department`, `year`, `skills`, `updatedAt`; plus optional `campusId`), authenticated read, maintained atomically when `isDiscoverable == true`;
- `posts/{postId}`: text feed posts;
- `posts/{postId}/comments/{commentId}`: comments;
- `posts/{postId}/likes/{uid}`: individual likes;
- `connections/{canonicalConnectionId}`: one relationship document per pair;
- `users/{uid}/notifications/{notificationId}`: recipient-scoped notifications for connection requests/acceptances, event RSVPs, and resumable event cancellations;
- `conversations/{canonicalConnectionId}`: 1-to-1 conversation metadata between connected peers;
- `conversations/{canonicalConnectionId}/messages/{messageId}`: append-only immutable message subcollection;
- `campuses/{campusId}`: authoritative campus metadata for multi-tenancy and the CampusNest domain;
- `communities/{communityId}`: authoritative campus community metadata defining student clubs, societies, and cohorts;
- `communityMembers/{membershipId}`: authoritative community membership records linking students to campus communities with role-based security authority;
- `events/{eventId}`: authoritative campus event and student activity records (locked 17 fields);
- `eventRsvps/{eventId}_{userId}`: authoritative event participation intent records (locked 5 fields);
- `eventNotificationDeliveries/{eventId}`: authoritative event notification delivery ledger records for resumable cancellation fan-out (locked 14 fields).

The full field-level schema and current rule behavior are documented in [FIRESTORE_SCHEMA.md](FIRESTORE_SCHEMA.md).

### Community Domain, Membership Authority & Content Integration

CampusConnect structures collective student life through an institutional hierarchy:

```text
Campus
 └── Communities
        └── Community Members
              ↓
             Posts
```

1. **Campus Root:** Every community belongs permanently to an authoritative institutional tenant (`campusId`), inheriting the multi-tenant isolation boundary established in Milestone 18.
2. **First-Class Communities:** Defined in the root `communities/{communityId}` collection to provide uniform querying, direct identifier resolution, and architectural consistency with `campuses`, `posts`, and `conversations`.
3. **Community Membership Security Authority (`communityMembers`):**
   - **Root Collection Pattern:** Memberships reside in the root `communityMembers/{membershipId}` collection rather than subcollections, maintaining repository-wide root-domain conventions.
   - **Deterministic Canonical IDs:** Keyed deterministically as `{communityId}_{userId}` (e.g. `apex-ai-club_e2e-student-a`), ensuring idempotent writes and preventing duplicate memberships.
   - **Tenant Boundary Isolation:** Security rules enforce strict tenant parity: the member student's campus, community campus, and membership document campus must match (`campusId == getUserCampusId()`). Cross-campus memberships are rejected.
   - **Role-Based Authority & Privilege Escalation Prevention:** Supported roles include `member`, `moderator`, and `admin`. Client self-joins are strictly restricted to `member` role; self-promotion or client assignment of `admin` or `moderator` privileges is rejected by security rules. Validated active community admins can manage member roles (`member` <-> `moderator`) and statuses (`active` <-> `removed`). Active community moderators can manage statuses of regular members (`active` <-> `removed`). Privilege escalation is prevented by rules; moderators cannot modify admins or change roles. All moderation actions enforce tenant parity (`r.campusId == getUserCampusId()`).
   - **Decoupled Social Graph:** Community membership is completely independent of 1-to-1 connections (`connections`) and private messaging (`conversations`), ensuring community participation does not compromise personal connection boundaries.
4. **Community Content Integration & Post Moderation (`posts` as Single Root Collection):**
   - **Root Collection Pattern Preserved:** Rather than fracturing the database into separate collections (`communityPosts/{postId}`) or nested subcollections (`communities/{communityId}/posts/{postId}`), `posts/{postId}` remains the single authoritative collection for all posts.
   - **Optional Community Association:** Post documents optionally specify `communityId?: string`. When omitted, the post is a campus-wide feed item. When provided, the post represents a community discussion thread.
   - **Membership Authority Enforcement:** Creation of a community post (`communityId != null`) strictly requires active membership in `communityMembers/{communityId}_{authorId}` (`status == 'active'`) and tenant parity across the author's campus, community's campus, and post's campus.
   - **Post Moderation:** Community moderators and admins belonging to the same campus can delete (moderate) community posts. Campus-wide posts cannot be moderated by community moderators.
   - **Shared Infrastructure:** Likes, comments, real-time listeners, and cursor pagination reuse the robust, verified `posts` subsystem without divergent schemas.
5. **Community Client Layer (Services & Hooks):**
   The frontend exposes the community domain through a decoupled, two-tier client architecture:

   ```text
   Client Layer

   Community Services (communityService.js, communityMemberService.js)
           │
           ▼
   Community Hooks (useCommunities.js, useCommunity.js, useCommunityMembers.js)
           │
           ▼
   Future Community UI (Views, Cards, Detail Pages)
   ```

   - **Services Tier:** `communityService.js` and `communityMemberService.js` encapsulate all Firebase Firestore interaction, point lookups, real-time snapshot queries, document normalization, and membership actions (`joinCommunity`, `leaveCommunity`), maintaining clean separation from React components.
   - **Hooks Tier:** `useCommunities`, `useCommunity`, and `useCommunityMembers` provide React lifecycle integration, managing loading/error states, reactive subscriptions, and derived membership roles (`isMember`, `isAdmin`).
   - **UI Decoupling:** Client data access is established and unit tested independently prior to mounting UI screens, preserving testability and architectural boundaries.


### Messaging Architecture & Contracts

1. **The `updatedAt` Contract:**
   > `updatedAt` represents the timestamp of the latest message activity and changes only when a message is sent.

   - `sendMessage()` updates `updatedAt` with `serverTimestamp()`;
   - `markConversationAsRead()` modifies only the authenticated user's unread counter (`unreadCount.${userId} = 0`);
   - `markConversationAsRead()` must NOT modify `updatedAt`;
   - Conversation list ordering remains based on message activity (`orderBy("updatedAt", "desc")`), preventing read events from reordering the user's inbox.

2. **Bidirectional Transactional Coupling:**
   - Enforced strictly in Firestore Security Rules via `getAfter()` and `existsAfter()`.
   - `conversation.lastMessage` contains strictly four keys: `id`, `content`, `senderId`, and `createdAt`.
   - Creating a conversation requires the atomic creation of the child message matching `lastMessage.id`, `conversationId`, `senderId`, `content`, and `createdAt`.
   - Updating conversation metadata on message-send requires the atomic creation of the child message document with matching fields.
   - Creating a child message document requires `conversation.lastMessage` in `getAfter()` to match the message's `id`, `content`, `senderId`, and `createdAt`.
   - Neither standalone message creation nor standalone conversation metadata forging can occur.

### Event Architecture & Domain Model (Milestone 20)

The Event domain introduces first-class campus activities and student gatherings, anchored structurally to university campuses and student communities:

```text
Campus (Tenant Boundary)
   │
   ▼
Communities (Sponsoring Student Organizations)
   │
   ▼
Community Members / Authority (Moderator/Admin Leadership Gate)
   │
   ▼
Events (events/{eventId})
```

1. **Campus Tenancy & Storage Structure:**
   - Events reside in the root `events/{eventId}` collection, matching the flat collection architecture of `posts`, `communities`, and `connections`.
   - Every event is strictly and permanently bound to a parent campus via `campusId`.
   - Firestore Security Rules enforce tenant isolation: `resource.data.campusId == getUserCampusId()`. Cross-campus event discovery, detail reads, and creation are strictly denied.

2. **Sponsoring Community Relationship:**
   - Events are sponsored by a student organization identified by `communityId`.
   - Security rules require the parent community to exist and verify tenant parity (`get(/communities/$(communityId)).data.campusId == campusId`).
   - The event detail view integrates bidirectional navigation back to the sponsoring community at `/communities/:communityId`.
   - Communities surface a dedicated "Events" tab alongside "Discussion" at `/communities/:communityId`, presenting filtered community-specific events.

3. **Two-Tier Visibility Model:**
   - `campus_public`: Discoverable campus-wide by all authenticated students of the host university on `/events` and `/communities/:communityId`.
   - `community_only`: Restricted to active members of the sponsoring organization. Non-members cannot read the document via direct lookups or collection queries. Active community membership is verified via `isCommunityActiveMember(communityId)`.

4. **Stored Lifecycle Status vs. Derived Temporal State:**
   - **Stored Lifecycle (`status`):**
     - Allowed stored values: `published`, `cancelled`.
     - Creation requires initial status `published`.
     - Cancellation is an explicit organizer/moderator action that preserves event metadata for informational transparency while rendering a prominent cancellation banner.
   - **Derived Temporal State:**
     - Purely derived client-side from `startAt` and `endAt` timestamps relative to the current reference time:
       - `upcoming`: `referenceDate < startAt`
       - `ongoing`: `startAt <= referenceDate <= endAt`
       - `completed`: `referenceDate > endAt`
     - No persisted temporal state field exists in Firestore, eliminating synchronization drift, stale status bugs, and maintenance cron dependencies.

5. **Client Service, Hook, and UI Layering:**
   - **Services Layer (`eventService.js`):** Authoritative data access layer managing normalization (locked 17-field schema), date sorting, pure temporal/category filtering, rule-compatible Firestore collection queries, and lifecycle mutations (`createEvent`, `updateEvent`, `cancelEvent`, `deleteEvent`).
   - **Hooks Layer (`useEvents.js`, `useEvent.js`, `useEligibleCommunities.js`):** Manages component lifecycle, reactive subscriptions (`onSnapshot`), loading/error state machines, and leadership role detection.
   - **UI Surfaces:**
     - `/events`: Campus-wide discovery grid, search bar, temporal tabs (`Upcoming` / `Past Events`), category filter pills, community filter dropdown, and creation action.
     - `/events/:eventId`: Detailed event overview, date/time, venue location, organizer, category, status badge, visibility indicator, and sponsoring community card.
     - `/communities/:communityId`: "Events" navigation tab rendering community-scoped events.
     - `EventComposerModal.jsx`: Accessible modal dialog allowing eligible community leaders to publish new events.

6. **Authority & Creation Gate:**
   - Event creation is gated strictly to users with active leadership roles (`admin` or `moderator`) within the selected sponsoring community: `isCommunityModeratorOrAdmin(communityId)`.
   - The UI disables creation affordances for regular non-leader students, and Firestore Security Rules authoritatively reject unauthorized creation attempts.
   - Six fields are permanently immutable on creation: `id`, `campusId`, `communityId`, `createdBy`, `createdAt`, and `visibility`.

7. **Event RSVP and Participation Discovery Architecture (Milestone 21 Delivered):**
   - **Root Collection Pattern (`eventRsvps/{eventId}_{userId}`):** First-class root collection keyed by deterministic composite ID `{eventId}_{userId}`. Eliminates subcollections and allows global user-centric queries across events.
   - **Strict Five-Field Schema:** `id`, `eventId`, `campusId`, `userId`, `createdAt`. All fields are permanently immutable on creation. Document updates are prohibited in Security Rules (`allow update: if false;`).
   - **Existence-as-State Model:** The presence of an `eventRsvps` document represents "going"; absence represents "not going". There are no mutable status fields, capacity counters, or waitlist queues stored on the document.
   - **Three Locked Query Patterns:**
     - **Q1 (Point Read / Subscription):** `doc(eventRsvps, "${eventId}_${userId}")` to subscribe to the current user's RSVP state on an individual event.
     - **Q2 (User Participation Query):** `collection("eventRsvps").where("userId", "==", uid).where("campusId", "==", campusId)` driving the personal "Going" tab across all active events.
     - **Q3 (Event Attendee Query):** `collection("eventRsvps").where("eventId", "==", eventId).where("campusId", "==", campusId).limit(51)` feeding the attendee preview roster with a 50+ overflow cap.
   - **Derived Display States (`getRsvpDisplayState`):** Client-derived state computed from event temporal state and resolution without persisted flags:
     - `not_going`: No RSVP record exists.
     - `going`: Active RSVP on an accessible, upcoming/ongoing event.
     - `attended_window_passed`: Active RSVP on an event whose temporal window has completed.
     - `event_cancelled`: Active RSVP on a cancelled event; cancellation retains attendee record for visibility while disabling new registrations.
     - `event_unavailable`: Active RSVP where parent event is inaccessible (e.g. lost community membership or deleted parent event).
   - **Authorization Rules:**
     - Creation requires authenticated student, matching tenant campus, upcoming event (`request.time < event.startAt`), published event status, and parent event readability (`campus_public` or verified active member of sponsoring community).
     - Deletion is restricted to the RSVP owner (`resource.data.userId == request.auth.uid`), permitted after event ends, after event is cancelled, or if the parent event was deleted.
     - Reads are permitted for the owner, or for peers within the same campus if the parent event is readable.
   - **Participation Discovery Surfaces:**
     - Personal "Going" tab on `/events`: filters to user's RSVP'd events, resolves parent event documents with user/campus cache isolation, provides an attention section for inaccessible RSVPs and resolution errors, and includes an explicit "Remove RSVP" action for orphaned records.
     - Event card "Going" badges: rendered on `/events` discovery feed and community detail "Events" tabs.
     - Event detail registration card & mobile bar: interactive RSVP/Cancel button, derived badge, and real-time attendee avatar preview.

8. **Event Lifecycle Architecture & Management (Milestone 22 Delivered — Locked Revision 9):**
   - **Role-Based Leadership Authorization:**
     - Community Admin (`isCommunityAdmin(communityId)`): full lifecycle authority including detail updates, cancellation, republishing, and permanent hard delete.
     - Community Moderator (`isCommunityModerator(communityId)`): operational lifecycle authority including detail updates and cancellation; hard deletion is strictly prohibited.
     - Regular Members & Cross-Campus Students: read-only access within visibility bounds; management affordances are strictly omitted from the DOM.
   - **Adaptive Mutability State Machine:**
     - *Upcoming Events (`now < startAt`):* allows modifying all 9 domain allowlisted fields (`title`, `slug`, `description`, `category`, `location`, `startAt`, `endAt`, `imageURL`, `organizerName`). Strict absence and rejection of unsupported fields (`capacity`, `tags`). `startAt` must remain in the future, and `endAt >= startAt`.
     - *Ongoing Events (`startAt <= now <= endAt`):* core identity fields (`title`, `slug`, `category`, `organizerName`, `startAt`) are locked to prevent attendee confusion. Allows modifying `location`, `description`, `imageURL`, and non-shortening `endAt` extensions (`endAt >= originalEndAt`).
     - *Completed Events (`now > endAt`):* strictly read-only invariant; management toolbar and mutation actions are omitted.
   - **Dedicated Lifecycle Action Pathways:**
     - *Dedicated Cancellation (`published -> cancelled`):* permitted for upcoming and ongoing events (`now <= endAt`). Mutates only `status` and `updatedAt`. Closes attendee registration immediately while preserving existing attendee RSVPs for voluntary withdrawal.
     - *Dedicated Republishing (`cancelled -> published`):* permitted exclusively for upcoming events (`now < startAt`). Mutates only `status` and `updatedAt`. Removes cancellation warnings and reopens registration.
     - *Permanent Hard Deletion:* restricted exclusively to Community Administrators for upcoming events (`now < startAt`). Deletes event document from Firestore. Orphaned attendee RSVP documents are retained and surface under "RSVPs Requiring Attention" on the Going tab until voluntarily dismissed.
   - **Client Integration (`useEventManagement`):**
     - Custom hook evaluating authority hierarchy, campus parity, reactive boundary timers (triggering automatic state transitions without polling), persistent concurrency locks, and zero-flash optimistic state transitions.
     - UI surfaces: `EventManagementToolbar.jsx`, `EventEditModal.jsx`, `EventCancelModal.jsx`, `EventRepublishModal.jsx`, `EventDeleteModal.jsx`.

9. **Event Notification & Resumable Cancellation Delivery Architecture (Milestone 23 Delivered):**
   - **Supported Notification Types & Contracts:**
     - `event_rsvp`: Generated upon attendee RSVP creation and delivered to the event organizer (`event.createdBy`) with deterministic ID `rsvp_${eventId}_${actorId}`. Contains actor profile snapshot and optional `referenceTitle` strictly matching event title (max 100 characters). Suppressed from visible inbox and unread count when recipient disables `eventRsvp` notification preference.
     - `event_cancelled`: Generated upon event cancellation fan-out to all confirmed attendees. Keyed deterministically as `cancel_${eventId}_${cycleId}`, guaranteeing at most one notification per attendee per cancellation cycle. Suppressed from visible inbox and unread count when recipient disables `eventCancelled` notification preference.
     - **Backward Compatibility:** Connection notifications (`connection_request`, `connection_accepted`) strictly omit `cycleId` and `referenceTitle` to maintain backward-compatible schemas.
   - **Two-Way Atomic Handshake & Cancellation Ledger:**
     - Event cancellation (Pathway B) atomically transitions `events/{eventId}` to `status: 'cancelled'` and creates/updates `eventNotificationDeliveries/{eventId}` with initial status `pending`, unique `cycleId` (10–64 characters), `checkpointVersion: 0`, and `processedCount: 0`.
   - **Resumable Fan-Out Orchestration (`CHUNK_SIZE = 8`):**
     - Client delivery service batches attendee notifications in chunks of 8 to comply with the 20-access Firestore rule limit (`CHUNK_SIZE = 8`, up to 8 attendee writes + 1 ledger update = 9 operations per batch).
     - Queries `eventRsvps` ordered deterministically by `documentId()` with cursor progression (`startAfter(lastProcessedRsvpId)`).
     - Concurrency protection: Optimistic compare-and-set updates on `checkpointVersion == resource.checkpointVersion + 1`.
   - **Cancellation-Cycle Isolation & Republishing Supersession:**
     - When an in-progress or pending cancellation cycle is superseded by republishing (`published`) or event deletion, the ledger transitions to `status: 'superseded'`, immediately halting further delivery attempts.
     - Subsequent re-cancellation generates a fresh, isolated `cycleId` (`cycleId != resource.cycleId`), resetting `checkpointVersion: 0`, `processedCount: 0`, and status to `pending`, delivering new notifications without corrupting or reusing historical cycle records.
   - **Multi-Admin Resumption & Preserved Attribution:**
     - If cancellation fan-out is interrupted, any authorized community leader (admin or moderator) or the original event creator may resume delivery from the last durable checkpoint.
     - Security rules enforce that `actorId`, `actorName`, and `actorAvatar` on generated notifications remain permanently bound to the original cancelling actor recorded on the ledger, preventing spoofing or attribution changes during resumption.
   - **Point-Read Security & Multi-Tenant Isolation (Milestone 23.4.2 Invariants):**
     - Point reads of existing delivery ledgers require caller to belong to the same campus and be either the original cancelling actor (`actorId`) or an active community leader (`isCommunityModeratorOrAdmin`).
     - Point reads of nonexistent delivery-ledger documents require an existing parent event in the caller's campus and an active community leadership role (`isCommunityModeratorOrAdmin`).
     - Creator UID alone without active community leadership authority confers no read access to nonexistent ledgers.
     - Foreign-campus and unauthorized callers receive `permission-denied` regardless of whether the ledger document exists, eliminating existence-disclosure side-channels.

10. **Deferred Features:**
    - Capacity limits, waitlists, attendance verification, QR check-ins, ticketing, payment gateways, calendar synchronization (ICS / Google Calendar), background Cloud Functions, push notifications, and event comment threads remain explicitly deferred.

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
- owner and parent-readable non-owner RSVP read boundaries;
- delivery ledger collection `eventNotificationDeliveries/{eventId}` with locked 14-field schema, atomic cancellation handshake, and immutable creation identity;
- compare-and-set versioning (`checkpointVersion + 1`) and chunk size cap (`CHUNK_SIZE = 8`) within Firestore rule call budgets;
- strict cancellation-cycle isolation preventing stale cycle notification forgery;
- delivery ledger point-read security isolation (M23.4.2) preventing cross-campus existence disclosure side-channels and requiring active leadership authority for nonexistent document queries;
- actor attribution preservation ensuring secondary admin resumption retains the original cancelling actor's identity.

The development-only `SecurityTestPanel` exercises selected notification and user/settings rejection scenarios. It is not a production test runner and is not a replacement for automated emulator tests.

The Rules intentionally retain one documented limitation: the parent `/posts/{postId}` match can validate an exact nonnegative counter delta but cannot identify which arbitrary child comment changed in the same batch. Child-side `getAfter()` checks reject standalone and mismatched comment writes, while a parent-only exact delta remains possible until the data model adds a causality marker or ledger.

## Demo and deployment

Firebase Hosting serves the Vite build from `dist` and rewrites application routes to `index.html`.

The recruiter demo uses a normal Firebase Auth account configured through `VITE_DEMO_USER_EMAIL` and `VITE_DEMO_USER_PASSWORD`. The Admin SDK script in `scripts/seedDemoData.mjs` resolves or creates that account and writes deterministic demo profiles, posts, comments, likes, connections, and notifications. It uses an explicit whitelist and merge-only writes; Admin SDK writes bypass client Firestore Rules by design.

## Current limitations

- 880 unit tests across 43 files, 486 Firestore Emulator rules tests across 16 suites, and 12 Playwright E2E spec files (74 passing tests) are active.
- Email verification is not required after sign-up.
- Non-discoverable students are excluded from `directoryIndex` search queries; authenticated direct public profile reads (`/users/:uid`) remain accessible by design.
- Notifications are bounded to the newest 30 items rather than cursor-paginated.
- No media upload or Firebase Storage integration exists.
- No post editing, post sharing, post search, bookmarks, marketplace, or direct account deletion exists.
- Within the Event domain, ticketing, QR check-in, verified attendance, capacity caps, waitlists, calendar sync, push notifications, email delivery, and event comments remain deferred.
- Event cancellation notification fan-out is managed client-side in chunks of 8 with durable ledger recovery; trusted background event processors (Cloud Functions) remain deferred.
- The parent-only exact comment-counter limitation remains; a future ledger or server-side event model would be needed to prove arbitrary child causality.

## Deferred architecture, not current implementation

The following are possible later milestones and should not be treated as active architecture:

- trusted server-side event processing for notifications;
- media storage with separate Storage Rules and lifecycle cleanup;
- capacity caps, waitlists, QR check-in, ticketing, and calendar synchronization.