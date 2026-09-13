# CampusConnect Features

**Status:** Current implementation inventory (Milestone 13A)

This document distinguishes shipped behavior from deferred ideas. A feature is marked implemented only when it exists in the current application source and active Firebase model.

## Implemented

### Authentication and access

- Email/password registration.
- Email/password login.
- Browser-local Firebase Auth persistence.
- Logout.
- Password reset email.
- Auth initialization through `onAuthStateChanged`.
- Protected routes through `ProtectedRoute`.
- Public not-found and authenticated not-found navigation.

Email verification enforcement, OAuth providers, and account deletion are not implemented.

### Profiles

- Current-user profile page at `/profile`.
- Editable display name, bio, department, academic year, skills, and social links.
- Public profile page at `/users/:uid`.
- Initials-based avatar fallback with optional `photoURL` rendering.
- Public profile preview when viewing the current user's own profile.
- Department and academic-year metadata.
- Profile links for GitHub, LinkedIn, portfolio, and website.

There is no active image-upload flow, cover-image upload, or profile-photo management UI.

### Campus feed

- Dashboard at `/dashboard`.
- Text post creation.
- Feed ordered by newest `createdAt`.
- Real-time subscription to newer posts with cursor-based pagination for older posts.
- Author-only post deletion, with inline confirmation.
- Empty, loading, and error states.
- Multiline post rendering.

Posts cannot currently be edited, shared, searched, bookmarked, or attached to media.

### Likes

- Like/unlike action on posts.
- Current user's like state subscribed through the individual like document.
- Atomic like document and `likesCount` update through a Firestore transaction.
- Motion feedback animation for the like action.

### Comments

- Expandable comments under a post.
- Real-time comment subscription ordered by creation time.
- Text comment creation.
- Author-only comment deletion.
- Batched comment document and parent `commentsCount` updates.
- Inline comment composer with auto-resizing input.

### Student discovery

- Discover page at `/discover`.
- Search by display name, department, academic year, or skills.
- 300 ms search debounce.
- Bounded fetch of up to 100 users ordered by `updatedAt`.
- Client-side filtering for `isDiscoverable !== false`, while keeping the current user visible.
- Student result cards with initials/avatar, academic metadata, skills, and profile link.
- Loading, error, short-query, and no-result states.

This is not full-text, fuzzy, indexed, or paginated search.

### Connections

- Public-profile connection CTA.
- Deterministic canonical connection document IDs using lexicographically sorted participant UIDs.
- Send pending request.
- Cancel outgoing request.
- Accept incoming request.
- Decline incoming request.
- Remove an accepted connection.
- Real-time relationship state for a pair.
- Real-time list of the current user's accepted and pending relationships.
- Connection states: `none`, `outgoing_pending`, `incoming_pending`, and `connected`.
- Connections page at `/connections` with accepted, incoming, and outgoing sections.

The product uses the term “connection”; a separate friend-request/friendship model is not active.

### Notifications

- Recipient-scoped notification inbox at `/notifications`.
- Real-time subscription to the newest 30 notifications.
- All/unread filter tabs.
- Unread count in the Navbar and mobile navigation.
- Mark one notification as read.
- Mark all currently loaded notifications as read.
- Dismiss a notification.
- Inline accept/decline actions for incoming connection-request notifications.
- Profile link for the notification actor.

The active notification types are only:

- `connection_request`
- `connection_accepted`

Like, comment, message, event, and generic social notifications are not implemented.

### Settings and privacy controls

- Settings page at `/settings`.
- Read-only display of the authenticated email address.
- Discoverability toggle for student search.
- Connection-request notification preference.
- Accepted-connection notification preference.
- Sign out.
- Disabled account-deletion control explaining that backend cascade cleanup is deferred.

The current discoverability setting hides a student from search results but does not block direct authenticated profile reads. Email is omitted from public UI components, but the current Firestore document is broadly readable to authenticated clients; this is a known data-boundary limitation.

### Interface and accessibility behavior

- Campus Atelier paper/ink/terracotta visual language.
- Newsreader serif display headings and Inter body text.
- Responsive authenticated navigation with mobile menu.
- Shared Button, Card, Avatar, Input, Textarea, EmptyState, PageContainer, and Section primitives.
- Loading skeleton-style placeholders in major pages.
- Empty and error states for major data views.
- Keyboard-focus styles and semantic labels on key controls.
- Skip-to-main-content link in the Navbar.
- `prefers-reduced-motion` handling in the global stylesheet.
- Motion for the like and expandable-comment interactions.

### Development security audits and automated Rules tests

Settings and Notifications render a development-only `SecurityTestPanel`. The available suites exercise selected Firestore Rule rejection scenarios for:

- notification profile forgery, cross-user reads, immutable-field updates, and orphan writes;
- cross-user settings writes, email/UID tampering, field injection, and invalid setting types.

The repository also includes Vitest pure-helper tests and an isolated Firestore Emulator Rules suite covering users, posts, comments, likes, connections, and notifications. Rules tests use the fixed synthetic project `demo-campusconnect-rules-test`, deterministic fixtures, and synthetic authenticated contexts. Tests explicitly labeled as known gaps document current Rule behavior for Milestone 13C rather than changing the Rules. Service integration, end-to-end tests, and CI remain deferred.

### Recruiter demo and seeding

- Optional one-click demo login from the public login page.
- Demo persona: Alex Rivera.
- Admin SDK seeding script with deterministic peer/post/relationship IDs.
- Merge-only seeding with explicit whitelists and no bulk-deletion routine.
- Seeded feed activity, student profiles, connection states, and notifications.

## Not implemented / deferred

The following ideas are intentionally outside the current MVP:

- Post editing.
- Post sharing or reposting.
- Post search.
- Bookmarks or saved posts.
- Image, file, or rich-media uploads.
- Firebase Storage integration.
- Private messaging, conversations, read receipts, typing indicators, or presence.
- Like and comment notifications.
- Email verification enforcement.
- Password-change UI.
- Account deletion and cascading cleanup.
- Clubs, events, marketplace, internship board, or admin dashboard.
- Dark mode or theme switching.
- Cursor pagination and infinite scrolling.
- External full-text search.
- Background Cloud Functions for notification processing.
- Service integration tests, end-to-end tests, and CI.

These are future possibilities, not current routes, collections, or components.
