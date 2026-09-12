# CampusConnect Architecture

**Status:** Current implementation reference (Milestone 13C)

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
| Quality checks | ESLint; production Vite build; development-only Firestore security audit panel |

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
| `/users/:uid` | Authenticated | Public profile and connection CTA |
| `/connections` | Authenticated | Accepted connections and pending requests |
| `/notifications` | Authenticated | Scoped notification inbox |
| `/settings` | Authenticated | Privacy, notification preferences, and sign out |
| `*` | Public/auth-aware | Not-found page |

`ProtectedRoute` waits for authentication initialization and redirects unauthenticated users to `/`, preserving the attempted location for the login flow.

There is no separate route configuration folder, layout router, sidebar system, messaging route, events route, marketplace route, or admin route in the active application.

## Source tree

```text
src/
├── App.jsx
├── main.jsx
├── index.css
├── components/
│   ├── dev/              # Development-only security audit panel
│   ├── feed/             # Feed, posts, comments, composers
│   ├── layout/           # Navbar, PageContainer, Section
│   ├── notifications/    # NotificationItem
│   ├── search/           # StudentCard
│   └── ui/               # Button, Card, Avatar, Input, Textarea, EmptyState
├── contexts/             # AuthContext and its context value
├── data/                 # Deterministic demo data and ID whitelists
├── firebase/             # Firebase client initialization
├── hooks/                # Auth and domain hooks
├── pages/                # Route-level screens
├── services/             # Firebase Auth/Firestore operations
└── utils/                # Development security test runner
```

## Layer responsibilities

### Entry and authentication context

`AuthContext` owns the current authenticated user, authentication loading state, authentication errors, and the login, signup, logout, and password-reset commands. It configures browser-local Firebase Auth persistence and subscribes to `onAuthStateChanged`.

When an authenticated user is observed, the context ensures a corresponding Firestore profile exists. Authentication identity and Firestore profile data are related but are not currently represented by separate public/private Firestore documents.

### Pages

Pages compose the authenticated experience and own page-level state such as form values, active tabs, and feedback messages. They do not implement the Firestore data model themselves.

The main page responsibilities are:

- `Login` and `Register`: form validation and Auth commands.
- `Dashboard`: authenticated shell around `Feed`.
- `Profile`: profile display/edit form.
- `PublicProfile`: point-read profile display and relationship CTA.
- `Discover`: debounced student search and result grid.
- `Connections`: relationship tabs and page-local person cards.
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

### Services

The service modules are the Firebase boundary:

- `authService.js`: Firebase Auth persistence, subscriptions, login, signup, logout, reset, and Auth error normalization.
- `userService.js`: profile creation, profile subscriptions, profile/settings updates, point reads, normalization, and bounded user-directory caching.
- `postService.js`: post creation, newest-post subscription, deletion, and comment-counter updates.
- `commentService.js`: authoritative profile lookup, canonical comment snapshots, comment subscriptions, plus batched comment create/delete and parent counter updates.
- `likeService.js`: atomic like/unlike transactions and the current user's like subscription.
- `connectionService.js`: canonical relationship IDs, relationship transactions, notifications associated with connection transitions, and relationship subscriptions.
- `notificationService.js`: recipient-scoped notification subscription, normalization, read updates, batch mark-as-read, and dismissal.

## State and data-flow patterns

### Real-time listeners

The application selectively uses Firestore `onSnapshot` for:

- the newest feed posts;
- expanded post comments;
- the current user's like document for a post;
- the current user's connection relationships;
- a single relationship between two users;
- the current user's profile/settings;
- the current user's notifications.

Each subscription is owned by a hook or service caller and is cleaned up on unmount.

### Bounded reads and caching

The current read limits are deliberate MVP safeguards:

- feed: newest 50 posts;
- directory: newest 100 users ordered by `updatedAt`;
- notifications: newest 30 notifications ordered by `createdAt`;
- search: 300 ms input debounce, followed by client-side filtering across display name, department, year, and skills;
- directory result cache: two-minute module-level cache in `userService.js`.

The feed and directory do not currently implement cursor pagination or external full-text search.

### Atomic writes

- Likes use `runTransaction` to create/delete `posts/{postId}/likes/{uid}` and update `posts.likesCount` together.
- Comments use `writeBatch` to create/delete a comment and update `posts.commentsCount` together.
- Connection requests, acceptance, rejection, cancellation, and removal use transactions.
- Connection transactions may create or delete deterministic notification documents in the same transaction.

The client uses these atomic paths, while Firestore Rules remain the final authorization boundary.

## Active Firestore domains

The active collections are:

- `users/{uid}` profiles, settings, and account metadata;
- `posts/{postId}` text feed posts;
- `posts/{postId}/comments/{commentId}` comments;
- `posts/{postId}/likes/{uid}` individual likes;
- `connections/{canonicalConnectionId}` one relationship document per pair;
- `users/{uid}/notifications/{notificationId}` recipient-scoped connection notifications.

The full field-level schema and current rule behavior are documented in [FIRESTORE_SCHEMA.md](FIRESTORE_SCHEMA.md).

## Security model

The browser is treated as untrusted. Firestore Rules enforce the active authorization model, including:

- authenticated access to application data where permitted;
- strict user creation/resulting-document schemas, owner-only updates, and immutable identity fields;
- author-restricted post deletion and no generic post editing;
- exact like document schemas and transaction-coupled like counters;
- canonical comment snapshots, denied comment updates, and child/parent counter coupling;
- user-owned like creation/deletion;
- canonical connection IDs and participant arrays;
- recipient-only notification list and point reads;
- recipient-only routine notification read-state updates, with narrowly validated acceptance refreshes and sender-side cancellation cleanup;
- connection state transitions and notification transaction relationships.

The development-only `SecurityTestPanel` exercises selected notification and user/settings rejection scenarios. It is not a production test runner and is not a replacement for automated emulator tests.

The Rules intentionally retain one documented limitation: the parent `/posts/{postId}` match can validate an exact nonnegative counter delta but cannot identify which arbitrary child comment changed in the same batch. Child-side `getAfter()` checks reject standalone and mismatched comment writes, while a parent-only exact delta remains possible until the data model adds a causality marker or ledger.

## Demo and deployment

Firebase Hosting serves the Vite build from `dist` and rewrites application routes to `index.html`.

The recruiter demo uses a normal Firebase Auth account configured through `VITE_DEMO_USER_EMAIL` and `VITE_DEMO_USER_PASSWORD`. The Admin SDK script in `scripts/seedDemoData.mjs` resolves or creates that account and writes deterministic demo profiles, posts, comments, likes, connections, and notifications. It uses an explicit whitelist and merge-only writes; Admin SDK writes bypass client Firestore Rules by design.

## Current limitations

- Pure helper tests and an isolated Firestore Emulator Rules suite are configured for the current domains.
- Service integration tests, end-to-end tests, and a CI pipeline are not configured.
- Email verification is not required after sign-up.
- Public/private profile data share the `users/{uid}` document, and authenticated profile reads currently include the email field even though public UI components do not render it.
- Search discoverability is filtered in the client; direct authenticated profile reads remain available by product policy.
- The feed, directory, and notification reads are bounded rather than paginated.
- No media upload or Firebase Storage integration exists.
- No post editing, post sharing, post search, bookmarks, private messaging, clubs, events, marketplace, or direct account deletion exists.
- Notification generation currently originates in client connection transactions rather than a trusted background event processor.
- The parent-only exact comment-counter limitation remains; a future ledger or server-side event model would be needed to prove arbitrary child causality.

## Deferred architecture, not current implementation

The following are possible later milestones and should not be treated as active architecture:

- service integration, end-to-end, and CI verification beyond the current emulator Rules suite;
- separate public profile and private account/settings documents;
- cursor-based feed pagination and eventually indexed directory search;
- trusted server-side event processing for notifications;
- a minimal connection-gated one-to-one messaging model;
- media storage with separate Storage Rules and lifecycle cleanup.

Any future milestone must first be designed against the active service, hook, and Rules patterns rather than copied from older planning documents.
