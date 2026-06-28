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
- `createdAt` (timestamp).
- `updatedAt` (timestamp).

**Indexing & Scalability:**
- Index by `displayName` for basic user searches.

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

### 3. `comments`
Stores comments on posts.

**Fields:**
- `id` (string): Auto-generated Document ID.
- `postId` (string): Reference to `posts.id`.
- `authorId` (string): Reference to `users.uid`.
- `authorName` (string): Denormalized user name.
- `authorAvatar` (string | null): Denormalized user avatar.
- `content` (string): Text content of the comment.
- `createdAt` (timestamp).
- `updatedAt` (timestamp).

**Indexing & Scalability:**
- Index on `postId` + `createdAt` (ascending) to show comments in chronological order under a post.

---

### 4. `likes`
Tracks which users liked which posts.

**Fields:**
- ID format: `${postId}_${userId}` (helps prevent duplicate likes).
- `postId` (string): Reference to `posts.id`.
- `userId` (string): Reference to `users.uid`.
- `createdAt` (timestamp).

**Indexing & Scalability:**
- Index on `postId` to get all users who liked a post.
- Index on `userId` to get all posts liked by a user.

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

### 9. `notifications`
System notifications for users (e.g., someone liked your post).

**Fields:**
- `id` (string): Auto-generated Document ID.
- `recipientId` (string): The user receiving the notification.
- `actorId` (string): The user who triggered the event.
- `actorName` (string): Denormalized name of the actor.
- `actorAvatar` (string | null): Denormalized avatar of the actor.
- `type` (string): "like", "comment", "friendRequest_received", "friendRequest_accepted".
- `referenceId` (string): ID of the related post or request.
- `isRead` (boolean): Has the user viewed this.
- `createdAt` (timestamp).

**Indexing & Scalability:**
- Index on `recipientId` + `createdAt` (descending) to fetch recent notifications for a user.

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
