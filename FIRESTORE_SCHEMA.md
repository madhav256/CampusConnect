# Firestore Schema

This document details the NoSQL database schema for CampusConnect using Firebase Cloud Firestore.

## General Principles
- Use denormalization carefully to avoid excessive read costs.
- Store summarized user data (like `authorName`, `authorAvatar`) on related documents (e.g., posts) to minimize joins on the client side.
- Use `serverTimestamp()` for all `createdAt` and `updatedAt` fields.

---

## Collections

### 1. `users`
Stores user profile information.

**Fields:**
- `uid` (string): Firebase Auth UID (Document ID).
- `displayName` (string): User's full name.
- `email` (string): User's email address.
- `photoURL` (string | null): URL to avatar image.
- `bio` (string): Short biography.
- `department` (string): Academic department.
- `year` (string): Academic year.
- `skills` (array of strings): Tags for skills.
- `socialLinks` (map): Keys like `github`, `linkedin`, `portfolio`, `website`.
- `isDiscoverable` (boolean): Whether the student is searchable via the Discover page (default `true`).
- `notificationPreferences` (map): Notification toggles (defaults: `connectionRequests: true`, `connectionAccepted: true`).
- `createdAt` (timestamp).
- `updatedAt` (timestamp).

**Indexing & Scalability:**
- Index on `updatedAt` (descending) for the student discovery and search query (`fetchAllUsers(100)`). Single-field ascending/descending indexes are provisioned automatically by Firestore.
- Bounded fetch (up to 100 users) with client-side multi-field filtering across `displayName`, `department`, `year`, and `skills`, plus client-side filtering on `isDiscoverable !== false`.
- Future scalability: For platforms with thousands of users, an external search service (e.g., Algolia, Typesense) or search indexing can be introduced without changing the core user schema.
- Security & Privacy: Document-level security rules in `firestore.rules` enforce that only authenticated users can read profiles, and users can only mutate their own document. `uid`, `email`, and `createdAt` are immutable on updates. Type invariants enforce that `isDiscoverable` and notification preferences are booleans. The `email` field is strictly omitted from public UI components (`PublicProfile`, `StudentCard`).

---

### 2. `posts`
Stores feed posts.

**Fields:**
- `id` (string): Auto-generated Document ID.
- `authorId` (string): Reference to `users.uid`.
- `authorName` (string): Snapshot of user's name at time of posting (denormalized).
- `authorAvatar` (string | null): Snapshot of user's avatar.
- `content` (string): Text content of the post.
- `likesCount` (number): Counter for likes.
- `commentsCount` (number): Counter for comments.
- `createdAt` (timestamp).
- `updatedAt` (timestamp).

**Indexing & Scalability:**
- Index on `createdAt` (descending) to fetch the global feed.
- Index on `authorId` + `createdAt` for user-specific profile feeds.

---

### 3. `comments` (Subcollection)
Stores comments on posts. Located at `posts/{postId}/comments/{commentId}`.

**Fields:**
- `id` (string): Auto-generated Document ID.
- `authorId` (string): Reference to `users.uid`.
- `authorName` (string): Denormalized user name.
- `authorAvatar` (string | null): Denormalized user avatar.
- `content` (string): Text content of the comment.
- `createdAt` (timestamp).
- `updatedAt` (timestamp).

**Indexing & Scalability:**
- Index on `createdAt` (ascending) to show comments in chronological order under a post. No composite index needed on `postId` since it's a subcollection.

---

### 4. `likes` (Subcollection)
Tracks which users liked a post. Located at `posts/{postId}/likes/{userId}`.

**Fields:**
- `id` (string): User ID (`users.uid`). Using the liking user's UID as the document ID natively enforces uniqueness and prevents duplicate likes at the database layer.
- `userId` (string): Reference to `users.uid`.
- `createdAt` (timestamp): When the like was created.

**Indexing, Atomicity & Security:**
- Subcollection structure prevents unbounded array growth on the parent post document and eliminates the 1MB document size bottleneck.
- Maintained atomically alongside `posts.likesCount` via `runTransaction`.
- Security rules in `firestore.rules` validate atomic transaction results using `getAfter()` and `existsAfter()`:
  - Users can only create or delete their own like document (`request.auth.uid == userId`).
  - Like documents are immutable (`allow update: if false`).
  - Post `likesCount` can only increment or decrement by exactly 1 in sync with like document creation or deletion.
  - Non-authors cannot alter `authorId`, `authorName`, `authorAvatar`, `content`, `createdAt`, or `commentsCount`.

---

### 5. `friendRequests`
Tracks pending friend requests.

**Fields:**
- ID format: `${fromUserId}_${toUserId}`.
- `fromUserId` (string): User initiating the request.
- `toUserId` (string): User receiving the request.
- `status` (string): "pending", "accepted", "rejected".
- `createdAt` (timestamp).
- `updatedAt` (timestamp).

**Indexing & Scalability:**
- Index on `toUserId` + `status` to get pending requests for a user.

---

### 6. `friendships`
Stores accepted connections.

**Fields:**
- ID format: `${userId1}_${userId2}` (alphabetically sorted to ensure uniqueness).
- `users` (array of strings): Contains `userId1` and `userId2`.
- `createdAt` (timestamp).

**Indexing & Scalability:**
- Index on `users` (array-contains) to get all friends of a specific user.

---

### 7. `conversations`
Represents a chat channel between users (e.g., 1-on-1).

**Fields:**
- `id` (string): Auto-generated Document ID.
- `participants` (array of strings): UIDs of the users in the conversation.
- `lastMessage` (string): Preview of the last sent message.
- `lastMessageAt` (timestamp): Time of the last message.
- `unreadCount` (map): Keyed by UID with integer count.
- `createdAt` (timestamp).
- `updatedAt` (timestamp).

**Indexing & Scalability:**
- Index on `participants` (array-contains) + `lastMessageAt` (descending) to list a user's recent conversations.

---

### 8. `messages`
Stores individual chat messages.

**Fields:**
- `id` (string): Auto-generated Document ID.
- `conversationId` (string): Reference to `conversations.id`.
- `senderId` (string): Reference to `users.uid`.
- `content` (string): Message text.
- `isRead` (boolean): Whether it's been seen by the recipient.
- `createdAt` (timestamp).

**Indexing & Scalability:**
- Index on `conversationId` + `createdAt` (ascending) to load chat history.

---

### 9. `users/{userId}/notifications/{notificationId}` *(Milestone 8)*
System notifications for users, stored in a user-scoped subcollection for privacy and query performance.

**Document ID Formats:**
- Request Notification: `req_${connectionId}` (e.g. `req_minUid_maxUid`)
- Acceptance Notification: `acc_${connectionId}` (e.g. `acc_minUid_maxUid`)

**Fields:**
- `id` (string): Equals the document ID (`req_${connectionId}` or `acc_${connectionId}`).
- `recipientId` (string): The user receiving the notification (matches parent path `userId`).
- `actorId` (string): The user who triggered the event (`request.auth.uid`).
- `actorName` (string): Denormalized display name of the actor (verified against `/users/{actorId}`).
- `actorAvatar` (string | null): Denormalized avatar URL of the actor (verified against `/users/{actorId}`).
- `type` (string): `"connection_request"` | `"connection_accepted"`.
- `referenceId` (string): The canonical `connectionId`.
- `isRead` (boolean): Whether the recipient has viewed/marked this notification (`false` initially).
- `createdAt` (timestamp): Server timestamp when notification was created.

**Security & Atomicity Invariants (enforced in `firestore.rules`):**
- Notification creation is atomic with the corresponding connection state change:
  - `connection_request`: Verified via `existsAfter()` that the connection document exists, is `pending`, and sender equals the actor.
  - `connection_accepted`: Verified via `existsAfter()` that the connection document exists, is `accepted`, and receiver equals the actor.
- `actorName` and `actorAvatar` must match the actor's real `/users/{actorId}` record.
- Reading notifications list is strictly recipient-only.
- Single `get` allows recipient, or actor for atomic pre-check during request cancellation.
- Only the recipient may update `isRead`.
- Recipient can delete any notification; actor may only delete `connection_request` if the referenced connection is deleted in the same transaction.

**Indexing & Scalability:**
- Single-field descending index on `createdAt` within the subcollection is auto-managed by Firestore.
- **Zero composite indexes required.** Query: `collection("users", userId, "notifications"), orderBy("createdAt", "desc"), limit(30)`.

---

### 10. `bookmarks`
Allows users to save posts.

**Fields:**
- ID format: `${userId}_${postId}`.
- `userId` (string): Reference to `users.uid`.
- `postId` (string): Reference to `posts.id`.
- `createdAt` (timestamp).

**Indexing & Scalability:**
- Index on `userId` + `createdAt` (descending) to get a user's saved posts.

---

### 11. `connections` *(Milestone 7)*
Stores bidirectional student connection relationships with a deterministic document ID that enforces exactly one document per pair.

**Document ID:** `min(uid1, uid2) + "_" + max(uid1, uid2)` — lexicographically sorted so any two UIDs produce one canonical ID regardless of who initiates the request.

**Fields:**
- `users` (array of strings, size 2): Always `[min(uid1, uid2), max(uid1, uid2)]`. Enables the `array-contains` query.
- `senderId` (string): UID of the student who initiated the request.
- `receiverId` (string): UID of the student receiving the request.
- `status` (string): `"pending"` | `"accepted"`.
- `createdAt` (timestamp): Server-generated timestamp when the request was created.
- `updatedAt` (timestamp): Server-generated timestamp when the status was last changed.

**State Machine:**
```
none (doc absent)
  └─[senderId sends request]─▶ pending
         ├─[senderId cancels]──▶ none (doc deleted)
         ├─[receiverId declines]▶ none (doc deleted)
         └─[receiverId accepts]▶ accepted
                  └─[either participant removes]─▶ none (doc deleted)
```

**Security Invariants (enforced in `firestore.rules`):**
- Document ID must exactly equal the canonical sorted pair.
- `users` array must contain exactly both participants in sorted order.
- `senderId !== receiverId`.
- On create: `status` must be `"pending"`, caller must be `senderId`, all timestamps must be `serverTimestamp()`.
- On update: Only `receiverId` may update; only `status: "pending" → "accepted"` is permitted; all other fields are immutable.
- On delete: Only `senderId` may cancel pending, only `receiverId` may decline pending, either participant may remove accepted.

**Indexing & Scalability:**
- Single-field index on `users` (array) is auto-created by Firestore and is sufficient for `where("users", "array-contains", uid)` — **no composite index required**.
- Point lookup `doc("connections", getConnectionDocId(a, b))` costs exactly 1 read.

