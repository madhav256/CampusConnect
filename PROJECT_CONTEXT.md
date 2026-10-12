# CampusConnect Project Context

**Status:** Current project brief (Milestone 21 Delivered)

## Product

CampusConnect is a multi-tenant university student networking web application. The active application lets authenticated students maintain an academic profile, publish text updates, comment and like posts, discover classmates, manage connection requests, exchange 1-to-1 private messages, join and participate in student communities, discover campus events, and manage their event RSVPs and participation discovery.

The current product boundary encompasses student profiles, public campus feeds, discovery, connections, notifications, direct 1-to-1 messaging, student communities, campus events, and event RSVPs. Rich media/image uploads, event ticketing/QR check-in, capacity caps, external search engines, and automated account deletion remain deferred.

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
- Firebase Hosting for the built SPA.
- Firebase Admin SDK for local/demo seeding and test state management.
- Vitest for unit testing.
- Playwright for end-to-end browser testing.

Firebase Storage is not initialized or used by the active client.

## Runtime architecture

The application is composed in `src/main.jsx` as `StrictMode` → `AuthProvider` → `App`. `App.jsx` defines public and authenticated routes. Pages compose feature components and hooks; hooks own subscription lifecycles and local domain state; service modules isolate Firebase Auth and Firestore operations.

The active source folders are:

```text
src/
├── components/
├── contexts/
├── data/
├── firebase/
├── hooks/
├── pages/
├── services/
└── utils/
```

There is no custom API server, server-rendered backend, or Cloud Functions deployment.

## Data and security

All primary data entities are tenant-scoped by `campusId`. Cross-tenant reads and writes are strictly forbidden by Firestore Rules.

The active Firestore collections are:

- `campuses/{campusId}`: registered university campuses;
- `communities/{communityId}`: campus-scoped student communities;
- `communityMembers/{membershipId}`: community membership records with roles (`member`, `moderator`, `admin`);
- `events/{eventId}`: campus events with lifecycle statuses (`draft`, `published`, `cancelled`) and visibility tiers (`campus-public`, `community-only`);
- `eventRsvps/{rsvpId}`: deterministic `{eventId}_{userId}` RSVP participation records;
- `users/{uid}`: private user account authority;
- `publicProfiles/{uid}`: public profile information for authenticated student networking;
- `directoryIndex/{uid}`: discoverability projection for search;
- `posts/{postId}`: campus and community feed posts, with comments and likes subcollections;
- `connections/{canonicalConnectionId}`: pairwise student connection relationships (`min_max` sorted UIDs);
- `conversations/{canonicalConversationId}`: pairwise 1-to-1 messaging conversations;
- `messages/{messageId}`: append-only conversation messages;
- `users/{uid}/notifications/{notificationId}`: recipient-scoped connection notifications.

Firestore Rules enforce multi-tenancy, authentication, ownership, canonical relationships, notification scoping, message coupling, event visibility, and RSVP invariants. The browser is treated as untrusted.

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

The application is deployed as a Firebase Hosting SPA. The login page can optionally expose one-click demo access for Alex Rivera through environment-configured credentials. `scripts/seedDemoData.mjs` uses Firebase Admin SDK, deterministic whitelists, and merge-only writes to seed campuses, demo accounts, peer profiles, posts, comments, likes, connection relationships, notifications, communities, events, and event RSVPs.

## Development constraints

- Improve the existing architecture instead of rewriting it.
- Keep Firebase access in service modules.
- Treat Firestore Rules as the security boundary, not UI checks.
- Keep reads bounded and understand the cost of new listeners/queries.
- Do not present deferred features or schemas as implemented.
- Do not add dependencies without an explicit need and review.
- Preserve the current multi-tenant security model.

## Current verification

The repository maintains five automated verification gates:
- **ESLint**: clean linting across application and test source.
- **Production build**: Vite bundle generation.
- **Unit tests**: 710 Vitest tests covering cutover, services, messaging, communities, events, event RSVPs, hooks, and helpers.
- **Firestore security rules tests**: 352 rules tests across 15 suites executed against the Firebase Emulator using the synthetic `demo-campusconnect-rules-test` project.
- **Playwright E2E browser tests**: 59 automated tests covering authentication, feed, discovery, connections, messaging, communities, events, and event RSVPs against the Firebase Emulator suite.
