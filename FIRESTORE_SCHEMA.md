# CampusConnect Firestore Schema

**Status:** Active client schema and Rule reference (Milestone 20 Delivered / Milestone 21 Planned)

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

conversations/{canonicalConversationId}
└── messages/{messageId}

campuses/{campusId} (campus authority)
communities/{communityId} (campus community authority)
communityMembers/{membershipId} (community membership authority)
events/{eventId} (campus events & activities authority)
eventRsvps/{eventId}_{userId} (event participation intent; rules pending M21.2)
```


The active client does not use separate `friendRequests`, `friendships`, or `bookmarks` collections.

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
| `campusId` | string or `undefined` | Optional institutional campus identifier (e.g. `apex-university`); defines tenant boundary |
| `communityId` | string or `undefined` | Optional community identifier (e.g. `apex-ai-club`); links post to a community discussion |

Client-created posts use an auto-generated Firestore document ID and initialize both counters to zero. The demo seeder uses deterministic IDs such as `demo_post_01` and writes seeded counter values through Admin SDK.

### Campus-Wide vs. Community Posts

- **Campus-Wide Posts (`communityId` omitted or null):**
  - Standard social feed posts scoped to the author's campus (`campusId == getUserCampusId()`).
  - Existing behavior, indexing, and permissions are fully preserved.
- **Community Posts (`communityId` present):**
  - Connects the existing post system with communities without creating separate post collections (`communityPosts`) or subcollections (`communities/{id}/posts`).
  - Single source of truth: `posts/{postId}` remains the single root collection.
  - Requires **membership authority**: enforced in Firestore security rules via `communityMembers/{communityId}_{authorId}`.
  - Invariants strictly validated on creation:
    1. Parent community exists at `communities/{communityId}` (`exists(/communities/$(d.communityId))`).
    2. Community belongs to the same campus as the post (`get(/communities/$(d.communityId)).data.campusId == d.campusId`).
    3. Author holds an active membership record (`exists(/communityMembers/$(d.communityId + '_' + d.authorId))` and `data.status == 'active'`).
    4. Cross-campus community posts and posts by non-members, pending members, or removed members are strictly rejected.

### Queries and writes

- `subscribeToNewerPosts` listens for new posts in real-time (optionally filtered by `campusId` or `communityId`).
- `fetchOlderPosts` uses cursor-based pagination (`startAfter`) to load older posts incrementally.
- Community posts are surfaced through the community detail experience (`/communities/:communityId`), where eligible members create community posts via `CommunityPostComposer` and view discussion threads via `CommunityPostFeed`.
- Authenticated users can read posts from their own campus (`resource.data.campusId == getUserCampusId()`).
- Authenticated users can create a post when providing valid schema fields (author ID, non-empty content under 2000 characters, zero counters, and server timestamps for both `createdAt` and `updatedAt`).
- The post author can delete their own post. For community posts (posts with a valid `communityId`), active community moderators and admins belonging to the same campus can also delete (moderate) posts.
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

## 9. `conversations/{conversationId}`

Stores 1-to-1 conversation metadata between two connected students.

### Document IDs

Canonical sorted pair UID string: `min(uidA, uidB) + "_" + max(uidA, uidB)`, identical to `connections/{connectionId}`.

### Fields

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Must equal canonical conversation document ID |
| `participants` | array<string> | Exactly 2 UIDs, sorted lexicographically: `[p0, p1]` where `p0 < p1` |
| `participantProfiles` | map | Snapshot of public profile data: `{ [uid]: { displayName: string, photoURL: string \| null } }` matching `publicProfiles` authority |
| `lastMessage` | map | Most recent message summary; strictly 4 keys: `{ id: string, content: string, senderId: string, createdAt: timestamp }` |
| `unreadCount` | map | Map of `{ [uid]: number }` tracking unread message count for each participant |
| `createdAt` | timestamp | Creation time of conversation thread; immutable |
| `updatedAt` | timestamp | Timestamp of the latest message activity |

### The `updatedAt` Contract

> `updatedAt` represents the timestamp of the latest message activity and changes only when a message is sent.

Therefore:
- `sendMessage()` updates `updatedAt` with `serverTimestamp()`;
- `markConversationAsRead()` modifies only the authenticated user's unread counter (`unreadCount.${userId} = 0`);
- `markConversationAsRead()` must NOT modify `updatedAt`;
- Conversation list ordering remains based on message activity (`orderBy("updatedAt", "desc")`), not reading activity.

### Rule behavior & Bidirectional Coupling

- Read (`get`, `list`) restricted to authenticated participants (`request.auth.uid in resource.data.participants`).
- Deletions are forbidden (`allow delete: if false`).
- Document creation requires:
  - Active accepted connection in `connections/{conversationId}` (`status == 'accepted'`);
  - Deterministic canonical ID and lexicographically sorted 2-element participant array;
  - Authenticated sender is a participant;
  - `participantProfiles` matches `publicProfiles` authority;
  - Initial `unreadCount` has sender at `0` and recipient at `1`;
  - `createdAt` and `updatedAt` set to `request.time`;
  - **Bidirectional Transactional Coupling:** `lastMessage` must have strictly the 4 keys (`id`, `content`, `senderId`, `createdAt`). The child message at `/conversations/{conversationId}/messages/{lastMessage.id}` must exist in `existsAfter()` with exact matching `id`, `conversationId`, `senderId`, `content`, and `createdAt == request.time`. A conversation document cannot be created without its first message document in the same atomic write.
- Updates allow two distinct transitions:
  1. **Message-Send Transition:** Active accepted connection required. Immutable fields (`id`, `participants`, `participantProfiles`, `createdAt`) preserved. `updatedAt` set to `request.time`. Sender `unreadCount` set to `0`, recipient incremented by `1`. **Bidirectional Coupling:** `lastMessage` has strictly 4 keys, and the corresponding child message document must exist in `existsAfter()` with exact matching `id`, `conversationId`, `senderId`, `content`, and `createdAt == request.time`.
  2. **Read-Reset Transition:** Only `unreadCount` modified (`unreadCount.${myId} = 0`). Peer unread count, `lastMessage`, and `updatedAt` are strictly immutable during read reset.

## 10. `conversations/{conversationId}/messages/{messageId}`

Append-only message subcollection under a conversation thread.

### Document IDs

Generated auto-IDs (e.g. `doc(collection(db, "conversations", convId, "messages")).id`), kept stable across transaction retries.

### Fields

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Must equal message document ID |
| `conversationId` | string | Must equal parent conversation ID |
| `senderId` | string | Authenticated UID of sender |
| `content` | string | Message content (1 to 1000 characters) |
| `createdAt` | timestamp | Server timestamp of creation; immutable |

### Rule behavior & Bidirectional Coupling

- Read restricted to authenticated participants of the parent conversation.
- Updates and deletions are completely disallowed (`allow update: if false; allow delete: if false;`).
- Message creation requires:
  - Exact 5 keys (`id`, `conversationId`, `senderId`, `content`, `createdAt`);
  - `id == messageId` and `conversationId == conversationId`;
  - `senderId == request.auth.uid`;
  - Valid content length (1–1000 characters);
  - `createdAt == request.time`;
  - Existing accepted connection in `connections/{conversationId}`;
  - **Bidirectional Transactional Coupling:** Parent conversation evaluated with `getAfter(/conversations/{conversationId})`. The parent's `lastMessage` must match:
    - `lastMessage.id == messageId`
    - `lastMessage.content == request.resource.data.content`
    - `lastMessage.senderId == request.auth.uid`
    - `lastMessage.createdAt == request.time`
  - Neither a standalone message nor a standalone conversation summary can be created or updated independently.

## 11. `campuses/{campusId}` (Campus Authority)

Stores authoritative institutional metadata defining recognized university campuses. Serves as the foundation for multi-tenancy and the CampusNest ecosystem in StudentOS India.

### Fields

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Canonical campus identifier (e.g. `apex-university`); must equal document ID |
| `name` | string | Full official institutional name |
| `shortName` | string | Short institutional name or acronym |
| `slug` | string | URL-safe institutional slug |
| `domain` | string | Institutional email domain (e.g. `campusconnect.edu`, `stjude.edu`) |
| `location` | map | Nested map containing `city` (string), `state` (string), and `country` (string) |
| `status` | string | Institutional status (`active`, `pending`, `inactive`) |
| `branding` | map | Nested map containing `logoURL` (string or null) and `primaryColor` (string or null) |
| `createdAt` | timestamp | Document creation timestamp |
| `updatedAt` | timestamp | Last update timestamp |

### Query and access behavior

- Campuses are provisioned and maintained exclusively through administrative tools and seeding scripts (`scripts/seedCampuses.mjs`).
- Client mutations are forbidden (`allow write: if false;`).
- Read access is available to authenticated members for institutional verification, profile labeling, and campus-scoped queries.

## 12. `communities/{communityId}` (Campus Community Authority)

Stores authoritative metadata defining university student organizations, academic clubs, affinity groups, and cohorts. Serves as the community layer within CampusNest, extending student interaction from bilateral social connections to collective campus discovery.

### Fields

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Canonical community identifier (e.g. `apex-ai-club`); must equal document ID |
| `campusId` | string | Required parent campus identifier (e.g. `apex-university`); defines tenant boundary |
| `name` | string | Official community name (e.g. `Apex AI & Robotics Society`) |
| `slug` | string | URL-friendly identifier within campus (e.g. `ai-robotics-society`) |
| `description` | string | Community description and mission statement |
| `category` | string | Categorization enum (`academic`, `cultural`, `tech`, `sports`, `career`, `batch`, `interest`) |
| `imageURL` | string or null | Community avatar / crest URL |
| `bannerURL` | string or null | Community header cover banner URL |
| `createdBy` | string | Creator UID or system provenance identifier |
| `stats` | map | Nested map containing `memberCount` (integer >= 0) and `postCount` (integer >= 0) |
| `status` | string | Lifecycle status (`active`, `archived`, `pending_approval`) |
| `visibility` | string | Access visibility (`campus_public`, `campus_private`) |
| `createdAt` | timestamp | Document creation timestamp |
| `updatedAt` | timestamp | Last update timestamp |

### Tenant Ownership & Access Semantics

- **Strict Tenant Anchor:** Every community document belongs permanently to a single campus defined by `campusId`. A community cannot be transferred or shared across campuses.
- **Root Collection Design:** Communities reside in the root `communities` collection, maintaining structural consistency with `posts`, `connections`, `conversations`, and `campuses`.
- **Future Relationship with Posts & Members:**
  - **Posts:** Future community discussion posts will associate with this collection via an optional `communityId` on top-level `posts` documents, allowing community-scoped feeds alongside campus-wide announcements.
  - **Members:** Community memberships are managed through dedicated relationships in the root `communityMembers` collection, decoupling group membership from bilateral connection graphs.

## 13. `communityMembers/{membershipId}` (Community Membership Authority)

Stores authoritative membership records linking students to communities within their university campus. Serves as the security and authorization authority for community interactions, moderation privileges, and participation boundaries.

### Deterministic Document ID

```text
{communityId}_{userId}
```

Example: `apex-ai-club_e2e-student-a`. This deterministic pattern guarantees idempotent membership provisioning and prevents duplicate memberships for any given student in a community.

### Fields

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Canonical membership identifier (`{communityId}_{userId}`); must equal document ID |
| `communityId` | string | Reference to target parent community; immutable |
| `userId` | string | Firebase Auth UID of member student; immutable |
| `campusId` | string | Tenant campus identifier; must match both the student's campus and parent community campus |
| `role` | string | Authorization role enum (`member`, `moderator`, `admin`) |
| `status` | string | Membership state enum (`active`, `removed`, `pending`) |
| `joinedAt` | timestamp | Document creation timestamp; immutable |
| `updatedAt` | timestamp | Timestamp of last membership role or status modification |

### Tenant Boundary & Community Relationship

- **Strict Tenant Anchor:** A membership document permanently reflects the tenant boundary of its parent campus (`campusId`). Cross-campus memberships are strictly forbidden by security rules: a student cannot join a community hosted by a different campus.
- **Root Collection Design:** `communityMembers` is stored as a first-class root collection rather than a subcollection (`communities/{communityId}/members/{userId}`). This matches the repository-wide architectural pattern (e.g. `posts`, `connections`, `conversations`) and facilitates global queries across user memberships without collection group queries.
- **Decoupled Social Graph:** Community membership is fully decoupled from 1-to-1 connections (`connections`). Being a member of the same community does not automatically create a bilateral connection or open private messaging, preserving user privacy.

### Security Rules Behavior

- **Read Access:** Authenticated members of the same campus can read community memberships (`resource.data.campusId == getUserCampusId()`). Cross-campus reads are strictly denied (`permission-denied`).
- **Creation Validation:**
  - Owner authentication required (`request.auth.uid == userId`).
  - Strict 8-key schema enforcement (`isValidCommunityMemberCreate`).
  - Deterministic ID pattern enforced (`id == communityId + '_' + userId`).
  - Community existence and campus parity validated via `exists()` and `get(/communities/$(communityId)).data.campusId == campusId`.
  - User campus parity validated (`campusId == getUserCampusId()`).
  - Initial role restricted to `member` (`d.role == 'member'`), preventing self-assigned privilege escalation to `admin` or `moderator`.
  - Initial status restricted to `active` or `pending`.
- **Update Restrictions (Membership Integrity — H3):**
  - Member self-updates: Owners cannot change their membership status to `active` from any status. Owner updates are strictly restricted to voluntary departure from an active membership (`r.status == 'active' && d.status == 'removed'`). Self-reactivation from `removed → active` or `pending → active` is strictly denied. The `role` field and all other document fields remain immutable for the member (`d.role == r.role`, `immutableFieldsPreserved`), rejecting privilege escalation and field tampering.
  - Community moderator updates: Validated active community moderators (`isCommunityModerator(communityId)`) can manage membership status (`active`, `removed`, `pending`) exclusively for regular members (`r.role == 'member'`) within the same tenant campus (`r.campusId == getUserCampusId()`). Moderators cannot modify roles (`d.role == r.role`), manage fellow moderators or administrators, or escalate privileges.
  - Community admin updates: Validated active community admins (`isCommunityAdmin(communityId)`) retain full authority to update member roles (`member`, `moderator`, `admin`) and statuses (`active`, `removed`, `pending`), including member reinstatement (`removed → active`) and applicant approval (`pending → active`).
  - Tenant boundary isolation: All moderation updates require tenant parity (`r.campusId == getUserCampusId()`); cross-campus moderation is denied.
  - Arbitrary updates: Unrelated non-moderator/non-admin users cannot alter any membership document.
- **Deletion & Anti-Self-Reactivation (H3):**
  - Owner-initiated deletion is restricted to active memberships (`request.auth.uid == resource.data.userId && resource.data.status == 'active'`), supporting voluntary departure. Owners cannot delete membership documents whose current status is `removed` or `pending`.
  - Together with the deterministic document ID (`{communityId}_{userId}`), an existing non-active document (`removed` or `pending`) permanently blocks self-recreation or overwriting until an authorized administrator intervenes.
  - Active community administrators (`isCommunityAdmin(communityId)`) retain authority to delete any membership document regardless of status.

## 14. `events/{eventId}` (Campus Events & Activities Authority)

Stores authoritative event and activity records sponsored by campus communities. Serves as the security and authorization authority for event discovery, scheduling, lifecycle status, and visibility boundaries within each university tenant.

### Root Collection Design

`events/{eventId}` is stored as a top-level root collection rather than a subcollection (`communities/{communityId}/events/{eventId}`). This design enables campus-wide cross-community event discovery, category filtering, and date-range queries without requiring complex collection group queries or composite index proliferation.

### Locked 17-Field Schema

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Canonical event identifier; must equal document ID; immutable |
| `campusId` | string | Tenant campus identifier (`campuses/{campusId}`); immutable |
| `communityId` | string | Sponsoring community identifier (`communities/{communityId}`); immutable |
| `title` | string | Event title (3–120 characters) |
| `slug` | string | URL-safe slug derived from title (lowercase alphanumeric and hyphens) |
| `description` | string | Detailed event description (10–3000 characters) |
| `category` | string | Categorical classification enum |
| `location` | string | Physical venue, room number, or virtual meeting URL (2–200 characters) |
| `startAt` | timestamp | Event commencement date and time |
| `endAt` | timestamp | Event conclusion date and time; must be strictly after `startAt` |
| `imageURL` | string \| null | Optional banner image URL or null |
| `createdBy` | string | Firebase Auth UID of the creator; immutable |
| `organizerName` | string | Denormalized display name of sponsoring community at creation |
| `status` | string | Stored lifecycle status enum (`published`, `cancelled`) |
| `visibility` | string | Access visibility boundary enum (`campus_public`, `community_only`) |
| `createdAt` | timestamp | Document creation timestamp (`serverTimestamp()`); immutable |
| `updatedAt` | timestamp | Last modification timestamp (`serverTimestamp()`) |

### Immutable Fields

The following fields cannot be modified after document creation:

- `id`: Document identifier binding.
- `campusId`: Permanent tenant isolation anchor.
- `communityId`: Permanent sponsoring community anchor.
- `createdBy`: Permanent creator UID provenance.
- `createdAt`: Permanent creation timestamp.

### Stored Lifecycle Status

The `status` field tracks administrative lifecycle state:

- `published`: Active, visible event.
- `cancelled`: Event cancelled by organizers or moderators; retains record with cancellation warning.

### Access Visibility

The `visibility` field controls read access scoping:

- `campus_public`: Discoverable and readable by any authenticated student belonging to the tenant campus.
- `community_only`: Restricted exclusively to verified active members of the sponsoring community (`communityMembers` with `status: "active"`).

### Allowed Categories

Events must belong to exactly one of the 8 canonical categories:

- `academic`: Lectures, study sessions, academic symposia.
- `tech`: Hackathons, coding workshops, tech talks.
- `cultural`: Arts, music, theater, campus festivals.
- `sports`: Tournaments, intramural matches, fitness sessions.
- `career`: Job fairs, resume reviews, networking nights.
- `workshop`: Hands-on skill sessions, tutorials, labs.
- `social`: Mixers, meet-and-greets, game nights.
- `competition`: Debates, pitch competitions, design challenges.

### Derived Temporal State (Client-Side)

Temporal state is dynamically computed on the client relative to `now` and is **never** persisted in Firestore:

- `upcoming`: `now < startAt`
- `ongoing`: `now >= startAt && now <= endAt`
- `completed`: `now > endAt`

This design prevents stale time-based status fields in Firestore and eliminates scheduled database update workers.

### Security Rules Behavior

- **Strict Tenant Boundary:** All reads, queries, creates, and updates require tenant parity (`resource.data.campusId == getUserCampusId()` or `request.resource.data.campusId == getUserCampusId()`). Cross-campus access is rejected with `permission-denied`.
- **Read Authorization:**
  - `campus_public`: Readable by any authenticated student of the matching campus.
  - `community_only`: Readable only by verified active members of the sponsoring community via `isCommunityActiveMember(communityId)`.
- **Create Authorization:**
  - Authenticated student with matching campus tenant.
  - Verified active community leader: creator must be an active `moderator` or `admin` of the sponsoring community via `isCommunityModerator(communityId) || isCommunityAdmin(communityId)`.
  - Sponsoring community must exist and belong to the same campus.
  - Strict 17-field schema enforcement (`isValidEventCreate`).
  - `endAt > startAt` chronological integrity enforced.
  - `status` must be `published`.
  - `createdAt` and `updatedAt` must equal `request.time`.
- **Update Authorization:**
  - Allowed only by the original creator (`request.auth.uid == resource.data.createdBy`), an active community moderator, or an active community admin.
  - Strict 17-field schema enforcement (`isValidEventUpdate`).
  - All immutable fields (`id`, `campusId`, `communityId`, `createdBy`, `createdAt`) are preserved.
  - Chronological integrity (`endAt > startAt`) preserved.
  - `updatedAt` must equal `request.time`.
- **Delete Authorization:** Hard deletion is blocked in security rules. Organisational lifecycle is managed via status update to `cancelled`.

## 15. `eventRsvps/{eventId}_{userId}` (Event Participation Intent)

Stores student declared intent to attend campus events ("RSVP"). Serves as the domain authority for student event attendance across university tenants.

### Root Collection Design

`eventRsvps/{eventId}_{userId}` is stored as a top-level root collection rather than a subcollection (`events/{eventId}/rsvps/{userId}`). This matches the repository-wide architectural pattern (e.g. `communityMembers`, `posts`, `connections`) and enables global queries across a student's participations (e.g. "My RSVPs" / Going tab across multiple events) without requiring collection group queries or collection group rules.

### Deterministic Document Identifier

Documents are keyed by the deterministic composite ID `{eventId}_{userId}`:
- Guarantees at most one RSVP per (event, user) tuple.
- Completely idempotent for writes and seed fixtures.
- Enables direct O(1) point reads to check whether the current user is attending an event.

### Locked Five-Field Schema

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Canonical composite identifier (`{eventId}_{userId}`); must equal document ID; immutable |
| `eventId` | string | Identifier of the attended event (`events/{eventId}`); immutable |
| `campusId` | string | Tenant campus anchor (`campuses/{campusId}`); must match event and student campus; immutable |
| `userId` | string | Firebase Auth UID of the attending student; immutable |
| `createdAt` | timestamp | Timestamp recording when the RSVP intent was established; immutable |

### Immutable Intent & Existence-as-State

- **Existence as "Going":** The presence of an `eventRsvps` document indicates the student is registered/going to the event.
- **Absence as "Not Going":** The absence of an `eventRsvps` document indicates the student is not attending.
- **Strictly Immutable:** Documents are created upon RSVP and deleted upon cancellation. There is no stored `status` field, mutable state, or update operation.
- **Exclusions:** The collection explicitly omits counters, waitlists, capacity caps, check-in flags, attendee notes, and reminder notifications. Headcounts and attendee previews are derived from bounded equality queries.

### Seeding & Prerequisites

- **Deterministic Seeding:** Seeded via `scripts/seedEventRsvps.mjs` and integrated into the global E2E seed pipeline via `scripts/seedE2E.mjs` (Step 2.5).
- **Prerequisites:** The standalone seeder strictly requires parent event documents (`events/{eventId}`) and user profiles (`users/{userId}`, `publicProfiles/{userId}`) to be seeded beforehand. It does not automatically seed parent data.
- **Validation Before Write:** All RSVP entries (fixtures and explicit overrides) are strictly validated against the 5-field schema and `${eventId}_${userId}` composite ID contract before any document is written to Firestore. Malformed or mismatched entries are rejected immediately.

### Security Rules Status: Pending (Milestone 21.2)

> [!IMPORTANT]
> Security Rules for `eventRsvps/{eventId}_{userId}` are **PENDING** and scheduled for implementation in Milestone 21.2 (`v21.2.0-event-rsvp-security-rules`).
> Baseline hardening units H1, H2, and H3 do NOT implement RSVP security rules (H1 addressed temporal fixture determinism, H2 established strict event resolution without fallbacks, and H3 hardened community membership integrity).
> Client access to `eventRsvps` remains closed until M21.2 introduces the rule match block and hoists `isCommunityActiveMember`.

## Demo-only metadata

`scripts/seedDemoData.mjs` uses Firebase Admin SDK and writes `isDemo: true` on selected seeded profiles, posts, comments, likes, connections, and notifications. It also uses deterministic IDs for demo peers, posts, and relationships.

This metadata is a seeding concern, not a client feature. It is not required by the active client service modules and does not grant a client user additional privileges.

## Deferred schema references

The following schemas are not active and must not be used as if they already exist:

- `friendRequests` and `friendships`: the active relationship collection is `connections`.
- `bookmarks`: saved posts are not implemented.
- `eventParticipants` / advanced ticketing: while `eventRsvps` domain and seeding are introduced in M21.1 (security rules pending in M21.2), ticketing, attendance verification, QR check-in, capacity limits, waitlists, and calendar sync remain deferred.
- external search indexes: discovery currently uses a bounded `directoryIndex` projection read and client-side filtering; external search services (e.g. Algolia/Typesense) will be evaluated only when directory size or observed performance demonstrates a concrete need.

Any future schema should be added only alongside its service code, route/component behavior, Rules, seed/test fixtures, and documentation.
