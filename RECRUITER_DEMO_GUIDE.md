# CampusConnect — Recruiter Demo Guide

This guide is an internal reference for demonstrating the current CampusConnect MVP and explaining its engineering trade-offs. It describes implemented behavior only; future work is labeled separately.

---

## 1. Two-minute demo script

This sequence demonstrates the seeded workflow without intentionally changing its relationship state.

```text
/ (landing and demo login)
  └─▶ /dashboard (campus feed and interactions)
        └─▶ /discover (bounded student search)
              └─▶ /users/:uid (profile and connection CTA)
                    └─▶ /connections (relationship states)
                          └─▶ /notifications or /settings (wrap-up)
```

### 0:00–0:15 — Landing and demo login

- **Route:** `/`
- **Show:** The **Recruiter & Evaluator Access** card and **Explore as Demo Student (Alex Rivera)**.
- **Explain:** This is an ordinary unprivileged Firebase Auth account. The login page uses `VITE_DEMO_USER_EMAIL` and `VITE_DEMO_USER_PASSWORD` when those deployment variables are configured; it does not bypass authentication.
- **Technical points:** `AuthContext` owns session state and browser-local persistence. `ProtectedRoute` redirects unauthenticated visitors to `/`.

### 0:15–0:45 — Feed and atomic interactions

- **Route:** `/dashboard`
- **Show:** The text composer, a like, and an expanded comment list.
- **Explain:** The feed uses a real-time Firestore listener limited to the newest 50 posts. A like transaction creates/deletes the current user's like document and adjusts the denormalized `likesCount` together.
- **Technical points:** `onSnapshot`, `runTransaction`, Motion feedback, and author-only post/comment deletion.
- **Precaution:** Click a like once and allow the request to finish before demonstrating another action.

### 0:45–1:05 — Student discovery

- **Route:** `/discover`
- **Show:** Search for `design` or `robotics`.
- **Explain:** The client fetches up to 100 users ordered by `updatedAt`, waits 300 ms after input changes, and filters name, department, year, and skills locally. Non-discoverable profiles are filtered from directory results except for the current user.
- **Technical points:** bounded reads, a two-minute directory cache, client-side filtering, and explicit empty/error states.

### 1:05–1:30 — Public profile

- **Route:** `/users/:uid`
- **Show:** A seeded peer profile such as Marcus Vance or Devon Park.
- **Explain:** The page point-reads the selected `users/{uid}` document and renders public-facing profile fields. The UI omits email, but the current Firestore document combines public and private fields, so this is not field-level privacy isolation.
- **Technical points:** `fetchUserById`, profile normalization, and a connection CTA derived from the canonical relationship document.

### 1:30–1:50 — Connection management

- **Route:** `/connections`
- **Show:**
  - **Active Connections:** Maya Lin and Marcus Vance;
  - **Incoming Requests:** Devon Park;
  - **Pending Requests:** Elena Rostova.
- **Explain:** Each pair uses one canonical document ID formed by lexicographically sorting the two UIDs. The supported lifecycle is send, cancel, accept, decline, and remove.
- **Technical points:** transactions coordinate connection state and deterministic connection notifications; Rules restrict participant actions and receiver-only acceptance.
- **Precaution:** Do not accept, decline, or remove a relationship during a standard demo. Those actions mutate the live seeded state. The Admin seeder is merge-only and does not provide a reset-by-deletion routine.

### 1:50–2:00 — Notifications and settings

- **Routes:** `/notifications` or `/settings`
- **Show:** The unread notification badge, notification filters, or discoverability/connection-notification settings.
- **Explain:** Notifications are recipient-scoped and currently cover connection requests and accepted connections. The development-only SecurityTestPanel exercises selected Rule rejection scenarios; it is not a production test suite.

---

## 2. Technical talking points

### Atomic likes and denormalized counters

Likes live at `posts/{postId}/likes/{uid}` rather than in an unbounded array. `likeService.js` uses a Firestore transaction to write the individual like and update `posts.likesCount` together. Rules validate the resulting relationship and protect other post fields. The counter is a deliberate read-efficiency trade-off; higher-volume deployments could consider counter sharding.

**Sources:** `src/services/likeService.js`, `firestore.rules`, `src/components/feed/PostCard.jsx`.

### Canonical connections

A relationship is stored at `connections/{minUid_maxUid}`. Sorting both participant UIDs gives every caller the same document key and avoids duplicate pair records. The document stores `users`, `senderId`, `receiverId`, `status`, `createdAt`, and `updatedAt`. Client transactions and Rules enforce the supported pending-to-accepted transition and participant permissions.

**Sources:** `src/services/connectionService.js`, `src/hooks/useConnectionState.js`, `firestore.rules`.

### Service-layer architecture

Firebase SDK calls are kept in `src/services/`; reusable UI components do not query Firestore directly. Hooks such as `usePosts`, `useComments`, `useUserRelationships`, and `useNotifications` own subscription lifecycles and local loading/error state. `AuthContext` is reserved for authentication session state rather than acting as a general domain store.

**Sources:** `src/services/`, `src/hooks/`, `src/contexts/AuthContext.jsx`.

### Selective real-time listeners

`onSnapshot` is used for the bounded post feed, expanded comments, selected post-like state, user profile/settings views, relationships, and recipient notifications. Effects return unsubscribe callbacks. Directory search is intentionally a bounded fetch plus a two-minute module-level cache rather than a live listener.

### Client-untrusted authorization

UI checks improve usability but are not the security boundary. `firestore.rules` authenticates reads/writes, checks ownership and participant identity, validates canonical connection IDs and selected schemas, scopes notification reads to their recipient, and ties connection notification writes to transaction state. The development security panel covers selected rejection scenarios only; it is not a replacement for an emulator Rules suite.

**Sources:** `firestore.rules`, `src/components/dev/SecurityTestPanel.jsx`, `src/utils/securityTestRunner.js`.

---

## 3. Useful interview questions

### Why React and this structure?

Pages compose generic UI primitives and domain components. Service modules isolate Firebase operations, hooks manage subscriptions and domain state, and only authentication session state is shared through `AuthContext`. This keeps view code readable without introducing a global state library.

**Evidence:** `src/App.jsx`, `src/components/`, `src/hooks/`, `src/services/`, `src/contexts/AuthContext.jsx`.

### Why Firebase and Firestore?

Firebase provides managed email/password authentication, Firestore real-time listeners, and static hosting with a small operational footprint. The trade-offs are explicit: denormalized snapshots and counters, Rules-based authorization instead of server middleware, bounded client reads, and no custom server-side event processor in the current MVP.

**Evidence:** `src/firebase/config.js`, `FIRESTORE_SCHEMA.md`, `firestore.rules`.

### How is ownership enforced?

The browser is treated as untrusted. Rules compare the authenticated UID with owner or participant fields, restrict notification access to `recipientId`, protect immutable identity fields, and validate relationship transitions. Hidden or disabled UI controls are not relied on for authorization.

### How do likes, comments, and connections work?

Likes use a subcollection and transaction. Comments use a subcollection and a batch that writes the comment and parent counter together. Connections use one canonical pair document with a small state machine. Notifications are nested under each recipient's user document and use deterministic IDs for request/acceptance events.

### What would change at much larger scale?

The current limits are deliberate MVP boundaries. A larger deployment could add cursor-based feed pagination, an indexed search service, stronger public/private user data separation, trusted background notification processing, and counter-sharding where contention is measured. Each would require a reviewed data model and Rules design rather than simply adding infrastructure preemptively.

---

## 4. Honest limitations

Current limitations include:

- pure helper tests and an isolated Firestore Emulator Rules suite exist, but there are no service integration, end-to-end, or CI tests;
- feed, directory, and notifications are bounded rather than cursor-paginated;
- directory filtering is client-side rather than full-text indexed;
- the current `users/{uid}` document mixes public profile, email, discoverability, and notification settings;
- no Firebase Storage integration, media uploads, or image posts;
- no post editing, sharing, search, or bookmarks;
- no private messaging, presence, or read receipts;
- no email-verification enforcement, password-change UI, or account-deletion cascade;
- only connection request and acceptance notifications;
- notification creation currently occurs in client connection transactions rather than a trusted background processor;
- selected Rules hardening candidates remain documented for future review, including stronger coupling of some counter updates to the exact mutation that caused them.

These are known MVP boundaries, not hidden routes or missing components.

---

## 5. Deferred next steps

The following are proposed, not implemented commitments:

1. **Rules hardening and broader verification:** resolve the documented current Rule gaps, then add service integration checks and CI around the existing emulator Rules suite.
2. **Public/private data boundary:** separate sensitive account/settings data from public profile reads and revisit discoverability enforcement at the data boundary.
3. **Scalable read paths:** add cursor-based feed pagination and, if needed, an indexed discovery search.
4. **Trusted event processing:** evaluate background processing for notification generation and retries.
5. **Minimal connection-gated messaging:** only after privacy, abuse controls, and message data ownership are designed.

Do not describe these as current capabilities during a demo.

---

## 6. Demo troubleshooting

| Issue | Cause | Resolution |
| --- | --- | --- |
| Demo login fails locally | Demo environment variables are absent or do not match the seeded Auth account. | Check `.env.local` for `VITE_DEMO_USER_EMAIL` and `VITE_DEMO_USER_PASSWORD`. |
| Feed or directory is empty | The local Firebase project has not been seeded or the client points at a different project. | Verify Firebase configuration and run `npm run seed:demo` with authorized Admin credentials. |
| Relationship state changed during the demo | An accept, decline, cancel, or remove action was activated. | Explain the lifecycle, or reseed the separate demo project; do not claim the live client auto-resets state. |
| Development audit is not visible | The build is a production build. | The panel is intentionally development-only; inspect the regular settings/notification UI instead. |
| Hosted demo is slow initially | Firebase connection setup or network latency. | Allow the initial listener to connect before interacting. |

The seeder uses explicit demo ID whitelists and merge-only writes. It may write Admin-only metadata such as `isDemo`; normal browser clients remain governed by Firestore Rules.

---

## 7. Thirty-second project summary

> CampusConnect is a university student networking platform built with React, Tailwind CSS, and Firebase. It offers a real-time text feed with comments and likes, bounded student discovery, canonical connection management, and recipient-scoped connection notifications.
>
> The engineering focus is data integrity and clear boundaries: likes use atomic Firestore transactions, connections use deterministic sorted-pair IDs, hooks own listener lifecycles, and a dedicated service layer keeps Firebase operations out of UI components. The interface uses the Campus Atelier design system, and an ordinary seeded demo account lets evaluators explore the product quickly while the documentation stays explicit about MVP limits and deferred scale work.
