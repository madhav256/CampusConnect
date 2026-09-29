# CampusConnect Firestore Schema

**Status:** Active client schema and Rule reference (Milestone 14B / Milestone 15)

This document describes the collections used by the current browser application. Firebase Admin SDK demo seeding can add deterministic metadata outside the client write path; those seeder-only details are called out explicitly.

## General principles

- Firestore is the source of truth for live application data.
- Client Auth and Firestore calls are isolated in `src/services/`.
- The browser is untrusted; client-side validation is only a user-experience layer.
- Firestore Security Rules are the authorization boundary for client-originated operations.
- `serverTimestamp()` is used by active client mutations for `createdAt` and `updatedAt` where applicable.
- Small denormalized author/actor snapshots avoid a profile read for every feed item or notification.
- Likes are individual documents rather than an array on the post.
- Connection relationships use one canonical document per pair.
- Public profile data and private account settings are strictly decoupled across separate collections.

## Active collection map

```text
users/{uid} (private authority)
publicProfiles/{uid} (public-profile authority)
directoryIndex/{uid} (discoverability search projection)

posts/{postId}
├── comments/{commentId}
└── likes/{uid}

connections/{canonicalConnectionId}

users/{uid}/notifications/{notificationId}
```

The active client does not use separate `friendRequests`, `friendships`, `conversations`, `messages`, or `bookmarks` collections.

## 1. `users/{uid}` (Private Account Authority)

Stores private account metadata, authentication email, search discoverability status, and notification preferences. Accessible exclusively by the authenticated owner.

### Client-created and client-maintained fields

| Field | Type | Description |
| --- | --- | --- |
| `uid` | string | Firebase Auth UID; must equal document ID |
| `email` | string | Authenticated email address |
| `isDiscoverable` | boolean | Controls discoverability and directory index projection |
| `notificationPreferences` | map | `connectionRequests` (bool) and `connectionAccepted` (bool) |
| `createdAt` | timestamp | Account profile creation time |
| `updatedAt` | timestamp | Last settings update time |

### Query and privacy behavior

- Read access is strictly restricted to the owner: `allow read: if isOwner(userId);`. Unrelated authenticated users cannot read this document.
- `subscribeToUserProfile(uid)` subscribes to the owner's private document.
- Client profile creation requires an exact 6-field payload with valid types, matching email, and server timestamps. Creation must be executed in a batch that also creates `publicProfiles/{uid}` and (if `isDiscoverable == true`) `directoryIndex/{uid}`.
- Updates are restricted to owner-only mutations affecting only `isDiscoverable`, `notificationPreferences`, and `updatedAt`. `uid`, `email`, and `createdAt` are immutable.
- Setting `isDiscoverable` must be kept in atomic parity with `directoryIndex/{uid}` (present when true, deleted when false).
- Document deletion is prohibited: `allow delete: if false;`.

## 2. `publicProfiles/{uid}` (Public Profile Authority)

Stores public academic and social profile fields visible to all authenticated university members.

### Client-created and client-maintained fields

| Field | Type | Description |
| --- | --- | --- |
| `uid` | string | Firebase Auth UID; must equal document ID |
| `displayName` | string | Student display name |
| `photoURL` | string or `null` | Optional avatar image URL |
| `bio` | string | Student biography |
| `department` | string | Academic department |
| `year` | string | Academic year or class standing |
| `skills` | array<string> | List of student skill tags |
| `socialLinks` | map | Nested map of `github`, `linkedin`, `portfolio`, and `website` strings |

### Query and privacy behavior

- Authenticated users can read public profiles: `allow read: if isAuthenticated();`.
- Serves as the sole public authority for student profile details rendered at `/users/:uid` and public profile cards.
- Authoritative source for author/actor profile snapshots on comments and notifications.
- Updates are restricted to the owner: `allow update: if isOwner(userId);`.
- `uid` is immutable; all fields are type-checked against `isValidPublicProfileSchema(userId)`.
- Document deletion is prohibited: `allow delete: if false;`.

## 3. `directoryIndex/{uid}` (Discoverability Search Projection)

Stores a lightweight search projection containing only discoverable students. Powered by client-side queries for student discovery.

### Client-created and client-maintained fields

| Field | Type | Description |
| --- | --- | --- |
| `uid` | string | Firebase Auth UID; must equal document ID |
| `displayName` | string | Student display name |
| `photoURL` | string or `null` | Avatar image URL or null |
| `department` | string | Academic department |
| `year` | string | Academic year |
| `skills` | array<string> | Student skills for search filtering |
| `updatedAt` | timestamp | Timestamp of last profile/index update |

### Query and privacy behavior

- Authenticated users can read the directory index: `allow read: if isAuthenticated();`.
- `/discover` queries `directoryIndex` with `orderBy("updatedAt", "desc")` and `limit(100)` to provide responsive student discovery without exposing non-discoverable users.
- Maintained atomically by the owner during profile/settings updates: created when `isDiscoverable == true`, deleted when `isDiscoverable == false`.
- Creation requires owner authentication, schema compliance (`isValidDirectoryIndexCreate`), and `isDiscoverable == true` in `users/{userId}`.
- Deletion requires owner authentication and `isDiscoverable == false` (or nonexistent) in `users/{userId}`.

## 4. `posts/{postId}`

Stores text feed posts.

| Field | Type | Description |
| --- | --- | --- |
| `authorId` | string | Auth UID of the author; must equal `request.auth.uid` on create |
| `authorName` | string | Denormalized display-name snapshot |
| `authorAvatar` | string or `null` | Denormalized avatar snapshot |
| `content` | string | Trimmed post content; non-empty string with maximum length of 2000 characters |
| `likesCount` | number | Denormalized like counter; initialized to 0 |
| `commentsCount` | number | Denormalized comment counter; initialized to 0 |
| `createdAt` | timestamp | Creation time; must equal `request.time` |
| `updatedAt` | timestamp | Last validated update time; must equal `request.time` on create |

Client-created posts use an auto-generated Firestore document ID and initialize both counters to zero. The demo seeder uses deterministic IDs such as `demo_post_01` and writes seeded counter values through Admin SDK.

### Queries and writes

- `subscribeToNewerPosts` listens for new posts in real-time.
- `fetchOlderPosts` uses cursor-based pagination (`startAfter`) to load older posts incrementally.
- Authenticated users can read posts.
- Authenticated users can create a post when providing exactly the documented 8 keys, matching author ID, non-empty content under 2000 characters, zero counters, and server timestamps for both `createdAt` and `updatedAt`.
- The post author can delete their own post.
- The active UI has no post-edit operation.

### Rule behavior and known limitation

Posts are not editable through the client Rules. The only permitted post updates are validated atomic like/unlike transactions and comment-counter mutations. Like updates preserve all unrelated post fields, require an exact one-count delta, and require the matching like document's after-state. Counter updates preserve all unrelated post fields, require an exact one-count delta, a nonnegative result, and a server `updatedAt`.

Comment create/delete Rules also inspect the parent post's after-state, so standalone child writes and wrong deltas are rejected. Firestore Rules cannot identify an arbitrary comment ID from the parent post match, however; a parent-only exact `+1`/`-1` update remains a documented residual limitation.

## 5. `posts/{postId}/comments/{commentId}`

Stores comments under their parent post.

| Field | Type | Description |
| --- | --- | --- |
| `authorId` | string | Comment author's Auth UID |
| `authorName` | string | Denormalized name snapshot from `publicProfiles` |
| `authorAvatar` | string or `null` | Denormalized avatar snapshot from `publicProfiles` |
| `content` | string | Trimmed comment text |
| `createdAt` | timestamp | Creation time |
| `updatedAt` | timestamp | Last update time |

`commentService` creates a generated comment ID and uses a batch to create the comment while incrementing the parent post's `commentsCount`. Deletion uses a batch to delete the comment and decrement the parent counter.

Comments are read with `orderBy("createdAt", "asc")` when a post's comments are expanded. There is no pagination or comment editing UI.

### Rule behavior

- Authenticated users can read comments.
- Comment creates require exactly the documented six fields, a nonempty string body, server timestamps, the authenticated author UID, and canonical `displayName`/`photoURL` values read from `publicProfiles/{authorId}`.
- A create must be batched with the parent post's exact `commentsCount + 1` and server `updatedAt` after-state.
- Comment updates are denied.
- Only the comment author can delete, and deletion must be batched with the parent post's exact nonnegative `commentsCount - 1` and server `updatedAt` after-state.

`commentService` obtains the authoritative public profile from `publicProfiles/{uid}` before writing a comment; the caller-provided AuthContext display-name/avatar arguments are not trusted for the denormalized snapshot.

## 6. `posts/{postId}/likes/{uid}`

Stores one like document per user per post. The document ID is the liking user's UID, preventing duplicate like documents for the same user/post pair.

| Field | Type | Description |
| --- | --- | --- |
| `userId` | string | Must match the document ID and Auth UID for client creation |
| `createdAt` | timestamp | Like creation time |

`likeService.togglePostLike` runs a transaction that:

- reads the like document and parent post;
- creates the like and increments `likesCount`, or deletes the like and decrements `likesCount`;
- writes both changes atomically;
- clamps the client-calculated unlike count at zero.

The UI subscribes only to the current user's like document rather than querying every liker.

### Rule behavior

- Authenticated users can read like documents.
- A user can create or delete only their own like document.
- Like updates are denied.
- The dedicated post validator uses `existsAfter()`/`getAfter()` to require the matching like document state and a one-count change for the validated transaction path.

## 7. `connections/{canonicalConnectionId}`

Stores exactly one relationship document for a pair of students.

### Canonical ID

```text
min(uidA, uidB) + "_" + max(uidA, uidB)
```

The same sorted-pair ID is used regardless of which student initiates the request.

### Fields

| Field | Type | Description |
| --- | --- | --- |
| `users` | array<string> | Exactly two UIDs, sorted lexicographically |
| `senderId` | string | UID that initiated the pending request |
| `receiverId` | string | UID that received the request |
| `status` | string | `pending` or `accepted` |
| `createdAt` | timestamp | Request creation time |
| `updatedAt` | timestamp | Last relationship update time |

### State machine

```text
(no document)
  └─ sender creates request ─▶ pending
       ├─ sender cancels ─────▶ (deleted)
       ├─ receiver declines ──▶ (deleted)
       └─ receiver accepts ───▶ accepted
                                  └─ either participant removes ─▶ (deleted)
```

### Queries and subscriptions

- A single relationship uses a canonical point reference.
- `subscribeToUserRelationships` queries `where("users", "array-contains", currentUid)` and partitions the returned documents in the hook.
- Public-profile state is derived from the single pair document.

### Rule behavior

- `get` and `list` access are restricted to participants, with the absent-document point-read behavior needed for transaction pre-checks.
- Creates require an authenticated sender, a different receiver, the canonical document ID, the sorted users array, `pending` status, server timestamps, and the exact field set.
- Updates allow only the receiver to change `pending` to `accepted`, with participants and creation time immutable.
- Deletes allow the sender to cancel pending, the receiver to decline pending, or either participant to remove an accepted relationship.

## 8. `users/{uid}/notifications/{notificationId}`

Stores connection notifications under the intended recipient's user document.

### Document IDs

- Request: `req_{connectionId}`
- Acceptance: `acc_{connectionId}`

### Fields

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Must equal the notification document ID |
| `recipientId` | string | Must equal the parent `uid` |
| `actorId` | string | Student who caused the event |
| `actorName` | string | Denormalized actor name from `publicProfiles` |
| `actorAvatar` | string or `null` | Denormalized actor avatar from `publicProfiles` |
| `type` | string | `connection_request` or `connection_accepted` |
| `referenceId` | string | Canonical connection ID |
| `isRead` | boolean | Recipient read state |
| `createdAt` | timestamp | Creation time |

The current notification service orders by `createdAt` descending and limits subscriptions to 30 documents.

### Transaction behavior

`connectionService` may write notifications in the same transaction as the corresponding connection transition:

- send request: create the pending connection and optional recipient request notification;
- cancel request: delete the connection and existing request notification;
- accept request: update the connection, remove the incoming request notification, and optionally create an acceptance notification;
- reject request: delete the connection and incoming request notification.

Notification preferences are read before the connection transaction and determine whether the optional notification write is included.

### Rule behavior

- Notification list queries are recipient-only.
- Both notification list queries and point reads are recipient-only; actors and unrelated users cannot read a notification.
- Creates require the exact schema, recipient path, actor identity, verified actor profile values from `publicProfiles/{actorId}`, deterministic ID/type, and the corresponding connection state in the same transaction using `existsAfter()`/`getAfter()`.
- The recipient can normally update only `isRead`. During the pending-to-accepted transition, the accepting actor may also refresh an existing deterministic acceptance notification in that same transaction; the full schema, actor profile, and connection before/after relationship remain validated.
- The recipient can delete notifications. The request sender may delete a request notification only while atomically deleting its still-pending connection; an absent deterministic request-notification delete remains idempotent.
- `cancelConnectionRequest` therefore reads only the connection as the sender and directly deletes the deterministic notification path without pre-reading it.

The Admin SDK demo seeder writes two deterministic notifications directly and may include `isDemo`; Admin credentials bypass client Rules. `isDemo` is not part of the normal client notification schema.

## Demo-only metadata

`scripts/seedDemoData.mjs` uses Firebase Admin SDK and writes `isDemo: true` on selected seeded profiles, posts, comments, likes, connections, and notifications. It also uses deterministic IDs for demo peers, posts, and relationships.

This metadata is a seeding concern, not a client feature. It is not required by the active client service modules and does not grant a client user additional privileges.

## Deferred schema references

The following schemas are not active and must not be used as if they already exist:

- `friendRequests` and `friendships`: the active relationship collection is `connections`.
- `conversations` and `messages`: private messaging is not implemented.
- `bookmarks`: saved posts are not implemented.
- external search indexes: discovery currently uses a bounded `directoryIndex` projection read and client-side filtering; external search services (e.g. Algolia/Typesense) will be evaluated only when directory size or observed performance demonstrates a concrete need.

Any future schema should be added only alongside its service code, route/component behavior, Rules, seed/test fixtures, and documentation.
