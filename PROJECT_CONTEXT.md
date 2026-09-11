# CampusConnect Project Context

**Status:** Current project brief (Milestone 13A)

## Product

CampusConnect is a university student networking web application. The current MVP lets authenticated students maintain an academic profile, publish text updates, comment and like posts, discover classmates, manage connection requests, and receive scoped connection notifications.

The current product boundary is intentionally focused on student profiles, a public campus feed, discovery, connections, and notifications. Private messaging, media uploads, events, clubs, marketplace workflows, and account deletion are deferred.

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
- Firebase Admin SDK for the local/demo seeding script.

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

There is no custom API server, server-rendered backend, global state library, Cloud Functions deployment, or active messaging subsystem.

## Data and security

The active Firestore collections are:

- `users/{uid}`;
- `posts/{postId}` with comments and likes subcollections;
- `connections/{canonicalConnectionId}`;
- `users/{uid}/notifications/{notificationId}`.

Likes and connection state use transactions. Comment create/delete operations use write batches. Firestore Rules enforce authentication, ownership, canonical relationships, notification scoping, and selected atomic postconditions. The browser is treated as untrusted.

The current profile document combines public profile data and private account/settings data. Search discoverability is filtered on the client, and direct profile reads remain available to authenticated students. This is a known privacy boundary for future hardening.

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

The application is deployed as a Firebase Hosting SPA. The login page can optionally expose one-click demo access for Alex Rivera through environment-configured credentials. `scripts/seedDemoData.mjs` uses Firebase Admin SDK, deterministic whitelists, and merge-only writes to seed the demo account, seven peer profiles, ten posts, comments, likes, four connection relationships, and two notifications.

## Development constraints

- Improve the existing architecture instead of rewriting it.
- Keep Firebase access in service modules.
- Treat Firestore Rules as the security boundary, not UI checks.
- Keep reads bounded and understand the cost of new listeners/queries.
- Do not present deferred features or schemas as implemented.
- Do not add dependencies without an explicit need and review.
- Preserve the current product boundary unless a milestone deliberately expands it.

## Current verification

The repository has ESLint and Vite build scripts. It also has a development-only in-app security audit for selected Rules scenarios. A conventional automated test suite, emulator Rules suite, and CI pipeline are not yet configured.
