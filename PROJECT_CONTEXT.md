# CampusConnect Project Context

**Status:** Current project brief (Milestone 24 Delivered)

## Product

CampusConnect is a multi-tenant university student networking web application. The active application lets authenticated students maintain an academic profile, publish text updates, comment and like posts, discover classmates, manage connection requests, exchange 1-to-1 private messages, join and participate in student communities, discover campus events, manage event RSVPs, execute role-based event lifecycle management (modals for editing, cancelling, republishing, and deleting), receive in-app notifications for connections, RSVPs, cancellations, and waitlist offers, and participate in capped events with high-concurrency capacity coordination and FIFO waitlists.

The current product boundary encompasses student profiles, public campus feeds, discovery, connections, notifications, direct 1-to-1 messaging, student communities, campus events, event RSVPs, event lifecycle management, resumable cancellation delivery ledgers, and capped-event capacity coordinators with FIFO waitlists. Rich media/image uploads, event ticketing/payment processing, QR check-in, external search engines, and automated account deletion remain deferred.

## Active stack

- React 19 and React DOM 19.
- Vite 8.
- JavaScript with JSX.
- React Router DOM 7.
- Tailwind CSS 4 through the Vite plugin.
- Motion for React for selected micro-interactions.
- Lucide React for icons.
- Firebase Authentication with email/password accounts.
- Cloud Firestore for application data and real-time subscriptions.
- Google Cloud Functions v2 (HTTPS callables, Cloud Tasks queue workers, scheduled sweepers, Firestore triggers).
- Firebase Hosting for the built SPA.
- Firebase Admin SDK for local/demo seeding and server-side microservice workers.
- Vitest for unit and boundary testing.
- Playwright for end-to-end browser testing.

Firebase Storage is not initialized or used by the active client.

## Operating mode: Option A

The project operates strictly under **Option A**:
- Firebase Spark plan (free tier) with ₹0 cloud spend.
- Google Cloud Functions v2 and Cloud Tasks execute inside the local Firebase Emulator Suite on synthetic project `demo-campusconnect-rules-test`.
- No credit card or paid cloud resources are provisioned.
- Production cloud deployment of backend functions and tasks is deferred pending explicit infrastructure approval.
- An alternative serverless edge proposal using Cloudflare Workers Free ([`ADR-025.md`](ADR-025.md)) remains `PROPOSED — PENDING EXPLICIT APPROVAL`; it is not approved, implemented, or merged.
- [ADR-024 Revision 33](file:///c:/Users/MADHAV/campus-connect/docs/architecture/decisions/ADR-024.md) remains the authoritative architectural specification for event capacity and waitlist management.

## Runtime architecture

The application is composed in `src/main.jsx` as `StrictMode` → `AuthProvider` → `App`. `App.jsx` defines public and authenticated routes. Pages compose feature components and hooks; hooks own subscription lifecycles and local domain state; service modules isolate client Firebase Auth and Firestore operations; and server microservices in `src/server/` handle privileged mutations (offers, claims, cancellations with promotions, queue head normalization).

The active source folders are:

```text
src/
├── components/
├── contexts/
├── data/
├── firebase/
├── hooks/
├── pages/
├── server/
├── services/
└── utils/
```

## Data and security

All primary data entities are tenant-scoped by `campusId`. Cross-tenant reads and writes are strictly forbidden by Firestore Rules.

The active Firestore collections are:

- `campuses/{campusId}`: registered university campuses;
- `communities/{communityId}`: campus-scoped student communities;
- `communityMembers/{membershipId}`: community membership records with roles (`member`, `moderator`, `admin`);
- `events/{eventId}`: campus events with lifecycle statuses (`published`, `cancelled`), visibility tiers (`campus_public`, `community_only`), and optional capacity settings;
- `eventRsvps/{rsvpId}`: deterministic `{eventId}_{userId}` RSVP participation records;
- `eventNotificationDeliveries/{eventId}`: durable delivery ledger tracking multi-chunk event cancellation notification fan-out with point-read security isolation;
- `eventCapacities/{eventId}`: authoritative capacity coordinator tracking headcounts, active offers, and monotonic queue sequence counters;
- `eventWaitlistSlots/{eventId}_{sequenceNumber}`: FIFO waitlist queue slot log tracking slot lifecycle (`waiting`, `offered`, `claimed`, `declined`, `expired`, `withdrawn`);
- `eventWaitlistMembers/{eventId}_{userId}`: private student waitlist membership index records;
- `eventWaitlistContinuations/{eventId}`: durable continuation task staging (server-only);
- `eventWaitlistOutbox/{eventId}_{candidateSequence}`: transactional notification outbox (server-only);
- `systemWaitlistJobs/{jobId}`: sweeper job execution checkpoints (server-only);
- `users/{uid}`: private user account authority;
- `publicProfiles/{uid}`: public profile information for authenticated student networking;
- `directoryIndex/{uid}`: discoverability projection for search;
- `posts/{postId}`: campus and community feed posts, with comments and likes subcollections;
- `connections/{canonicalConnectionId}`: pairwise student connection relationships (`min_max` sorted UIDs);
- `conversations/{canonicalConversationId}`: pairwise 1-to-1 messaging conversations;
- `messages/{messageId}`: append-only conversation messages;
- `users/{uid}/notifications/{notificationId}`: recipient-scoped in-app notifications (connection requests, accepted connections, event RSVPs, event cancellations, waitlist offers).

Firestore Rules enforce multi-tenancy, authentication, ownership, canonical relationships, notification scoping, message coupling, event visibility, RSVP invariants, delivery ledger authorization, and Section 7 waitlist rules. The browser is treated as untrusted.

## Design direction

The active visual language is **The Campus Atelier**:

- warm paper backgrounds and white surfaces;
- ink and muted stone text;
- warm borders;
- terracotta accents;
- Newsreader serif headings;
- Inter sans-serif body text;
- restrained Motion interactions;
- responsive layouts and reduced-motion support.

The design priority is clarity, editorial warmth, accessible interaction, and consistency rather than generic dashboard styling or visual novelty.

## Demo and deployment

The public demo is deployed as a Firebase Hosting SPA. The login page exposes one-click demo access for Alex Rivera through environment-configured credentials. `scripts/seedDemoData.mjs` uses Firebase Admin SDK, deterministic whitelists, and merge-only writes to seed campuses, demo accounts, peer profiles, posts, comments, likes, connection relationships, notifications, communities, events, event RSVPs, capacity coordinators, and waitlist slots.

## Development constraints

- Improve the existing architecture instead of rewriting it.
- Keep Firebase client access in service modules.
- Treat Firestore Rules as the security boundary, not UI checks.
- Keep reads bounded and understand the cost of new listeners/queries.
- Do not present deferred features or schemas as implemented.
- Do not add dependencies without an explicit need and review.
- Preserve the current multi-tenant security model.
- Maintain Option A zero-cost local execution; do not trigger cloud spend or provision unapproved infrastructure.

## Current verification

The repository maintains five automated verification gates:
- **ESLint**: clean linting across application and test source.
- **Production build**: Vite bundle generation.
- **Unit & Boundary tests**: 1,032 Vitest unit tests across 55 files + 16 Cloud Functions boundary tests = 1,048 total tests covering services, messaging, communities, events, RSVPs, lifecycle, notifications, capacity coordination, waitlists, normalization, task dispatchers, seed parity, hooks, and helpers.
- **Firestore security rules tests**: 579 rules tests across 16 suites (including TC-01 through TC-91) executed against the Firebase Emulator using synthetic project `demo-campusconnect-rules-test`.
- **Playwright E2E browser tests**: 76 automated tests across 16 spec files covering all journeys including authentication, feed, discovery, connections, messaging, mobile responsiveness, multi-tenancy, notifications, profile, communities, events, RSVPs, lifecycle management, cancellation delivery, and capped-event waitlist offer flows against the Firebase Emulator suite.
