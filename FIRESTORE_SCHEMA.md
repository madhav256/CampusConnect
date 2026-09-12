# CampusConnect Firestore Schema

**Status:** Active client schema and Rule reference (Milestone 13C)

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

## Active collection map

```text
users/{uid}
└── notifications/{notificationId}

posts/{postId}
├── comments/{commentId}
└── likes/{uid}

connections/{canonicalConnectionId}
```

The active client does not use separate `friendRequests`, `friendships`, `conversations`, `messages`, or `bookmarks` collections.

## 1. `users/{uid}`

Stores the current profile, account metadata, discoverability setting, and notification preferences in one document.

### Client-created and client-maintained fields

| Field | Type | Description |
| --- | --- | --- |
| `uid` | string | Firebase Auth UID; normally equal to the document ID |
| `displayName` | string | Display name |
| `email` | string | Authenticated email copied into the profile document |
| `photoURL` | string or `null` | Optional image URL; the active UI uses initials when absent |
| `bio` | string | Profile biography |
| `department` | string | Academic department |
| `year` | string | Academic year or class description |
| `skills` | array<string> | Skill tags |
| `socialLinks` | map | `github`, `linkedin`, `portfolio`, and `website` strings |
| `isDiscoverable` | boolean | Whether the profile appears in the client-side Discover results |
| `notificationPreferences` | map | `connectionRequests` and `connectionAccepted` booleans |
| `createdAt` | timestamp | Profile creation time |
| `updatedAt` | timestamp | Last profile/settings update time |

`createUserProfile` creates defaults for optional profile fields. `updateUserProfile` updates editable profile fields and `updatedAt`; `updateUserSettings` updates discoverability, notification preferences, and `updatedAt`.

Client profile creation must provide exactly this field set, use the authenticated UID and email, use the documented nested map shapes, and write both timestamps with `serverTimestamp()`. The Rules reject extra or missing fields, invalid primitive/nested types, cross-user identity, and client-supplied timestamps. Updates validate the resulting full document, preserve `uid`, `email`, and `createdAt`, and permit partial notification-preference maps.

### Queries and privacy behavior

- `subscribeToUserProfile(uid)` performs a document subscription.
- `fetchUserById(uid)` performs a point read.
- `fetchAllUsers(100)` orders by `updatedAt` descending and limits the result to 100 documents.
- `useUserSearch` filters the fetched list locally by display name, department, year, skills, and `isDiscoverable`.
- The current user remains visible in their own search results.

The current Rules allow authenticated users to read the full `users/{uid}` document. Public UI components intentionally omit email, but omitting a field from rendered JSX is not field-level data isolation. Separating public profile data from private account/settings data is deferred.

### Rule behavior

- Authenticated users can read user documents.
- Only the matching Auth UID can create, update, or attempt owner operations.
- `uid`, `email`, and `createdAt` are protected from updates.
- User updates are limited to the documented key set.
- `isDiscoverable` and notification preference values are type-checked on update.
- User document deletion is denied by the active Rules.

The Admin seeder bypasses client Rules by design, but browser profile creation and updates use the strict validators above. The broader public/private profile boundary remains deferred: authenticated users can still read the full profile document.

## 2. `posts/{postId}`

Stores text feed posts.

| Field | Type | Description |
| --- | --- | --- |
| `authorId` | string | Auth UID of the author |
| `authorName` | string | Denormalized display-name snapshot |
| `authorAvatar` | string or `null` | Denormalized avatar snapshot |
| `content` | string | Trimmed text content |
| `likesCount` | number | Denormalized like counter |
| `commentsCount` | number | Denormalized comment counter |
| `createdAt` | timestamp | Creation time |
| `updatedAt` | timestamp | Last validated counter update time |

Client-created posts use an auto-generated Firestore document ID and initialize both counters to zero. The demo seeder uses deterministic IDs such as `demo_post_01` and writes seeded counter values through Admin SDK.

### Queries and writes

- `subscribeToPosts` orders by `createdAt` descending and limits the feed to 50 posts.
- Authenticated users can read posts.
- Authenticated users can create a post when `authorId` matches their Auth UID, counters are zero, and `createdAt` is the request timestamp.
- The post author can delete their own post.
- The active UI has no post-edit operation.

### Rule behavior and known limitation

Posts are not editable through the client Rules. The only permitted post updates are validated atomic like/unlike transactions and comment-counter mutations. Like updates preserve all unrelated post fields, require an exact one-count delta, and require the matching like document's after-state. Counter updates preserve all unrelated post fields, require an exact one-count delta, a nonnegative result, and a server `updatedAt`.

Comment create/delete Rules also inspect the parent post's after-state, so standalone child writes and wrong deltas are rejected. Firestore Rules cannot identify an arbitrary comment ID from the parent post match, however; a parent-only exact `+1`/`-1` update remains a documented residual limitation.

## 3. `posts/{postId}/comments/{commentId}`

Stores comments under their parent post.

| Field | Type | Description |
| --- | --- | --- |
| `authorId` | string | Comment author's Auth UID |
| `authorName` | string | Denormalized name snapshot |
| `authorAvatar` | string or `null` | Denormalized avatar snapshot |
| `content` | string | Trimmed comment text |
| `createdAt` | timestamp | Creation time |
| `updatedAt` | timestamp | Last update time |

`commentService` creates a generated comment ID and uses a batch to create the comment while incrementing the parent post's `commentsCount`. Deletion uses a batch to delete the comment and decrement the parent counter.

Comments are read with `orderBy("createdAt", "asc")` when a post's comments are expanded. There is no pagination or comment editing UI.

### Rule behavior

- Authenticated users can read comments.
- Comment creates require exactly the documented six fields, a nonempty string body, server timestamps, the authenticated author UID, and canonical `displayName`/`photoURL` values read from `users/{authorId}`.
- A create must be batched with the parent post's exact `commentsCount + 1` and server `updatedAt` after-state.
- Comment updates are denied.
- Only the comment author can delete, and deletion must be batched with the parent post's exact nonnegative `commentsCount - 1` and server `updatedAt` after-state.

`commentService` obtains the authoritative Firestore profile before writing a comment; the caller-provided AuthContext display-name/avatar arguments are not trusted for the denormalized snapshot.

## 4. `posts/{postId}/likes/{uid}`

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

## 5. `connections/{canonicalConnectionId}`

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

## 6. `users/{uid}/notifications/{notificationId}`

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
| `actorName` | string | Denormalized actor name |
| `actorAvatar` | string or `null` | Denormalized actor avatar |
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
- Creates require the exact schema, recipient path, actor identity, verified actor profile values, deterministic ID/type, and the corresponding connection state in the same transaction using `existsAfter()`/`getAfter()`.
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
- external search indexes: discovery currently uses a bounded Firestore read and local filtering.
- public/private profile split: the current `users` document still combines those concerns.

Any future schema should be added only alongside its service code, route/component behavior, Rules, seed/test fixtures, and documentation.
