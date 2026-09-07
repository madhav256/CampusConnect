# CampusConnect

A university student networking platform built with React, Tailwind CSS, and Firebase, with real-time social features and Firebase-backed authentication and data.

* **Live Demo**: [https://campusconnect-cf191.web.app](https://campusconnect-cf191.web.app)
* **Zero-Setup Demo Access**: Navigate to `/` and click **"Explore as Demo Student (Alex Rivera)"** for instant access with pre-seeded campus activity—no manual sign-up or credentials required.

---

## Overview

CampusConnect allows university students to share studio and academic updates, discover peers across departments, establish academic connections, and track real-time notifications. The interface is styled using **The Campus Atelier** design system—featuring warm paper/ink tones, Newsreader editorial serif headings, Inter typography, and purposeful micro-interactions powered by Motion for React.

---

## Recruiter & Evaluator Quick Start

You can explore the live application immediately without setting up local credentials or Firebase configurations:

1. Visit the live deployment: **[https://campusconnect-cf191.web.app](https://campusconnect-cf191.web.app)**
2. On the login page (`/`), locate the **Recruiter & Evaluator Access** card.
3. Click **"Explore as Demo Student (Alex Rivera)"**.
4. You will be automatically authenticated and redirected to `/dashboard` as **Alex Rivera** (Senior, Architecture & Spatial Design).

The pre-seeded demo environment includes:
* **Feed Activity**: 10 realistic campus posts with likes and active comment threads.
* **Student Network**: 7 peer profiles across design, engineering, and humanities departments.
* **Connection States**: Active peer connections with Maya Lin and Marcus Chen, an incoming request from Devon Park, and a pending request to Elena Rossi.
* **Notifications**: Read and unread notifications scoped to the demo persona.

---

## Implemented Features

* **Authentication & Session Management**: Email/password sign-up, login, password reset emails, persistent sessions, and route guards (`ProtectedRoute`).
* **Real-Time Campus Feed**: Global feed ordered chronologically with real-time Firestore listeners, post creation, author-restricted post deletion, and real-time post comments.
* **Atomic Interactions**: Like/unlike operations executed via Firestore transactions, synchronizing counters and ensuring race-free state transitions with micro-animations.
* **Student Directory & Discovery**: Bounded directory query with real-time multi-field search (filtering across name, department, year, and skills tags) and respect for student discoverability settings.
* **Deterministic Student Connections**: Complete connection lifecycle (send request, cancel outgoing, accept incoming, decline incoming, remove connection) managed through a single canonical document pair.
* **Scoped Notifications**: User-isolated notifications for connection requests and acceptances with live unread counts, mark-as-read, mark-all-read, and dismissal.
* **Student Profiles**: Public profile view (`/users/:uid`) with dynamic connection action CTA, and an editable personal profile (`/profile`) managing bio, department, academic year, skills tags, and portfolio/social links.
* **Settings & Privacy**: Student discoverability toggles, notification preference toggles, password updates, and an in-app **Security Rules Test Panel** verifying rule enforcement.

---

## Technical Highlights

* **Atomic Transactions (`runTransaction`)**: Post liking/unliking uses Firestore transactions to atomically toggle the user's like document in `posts/{postId}/likes/{userId}` while incrementing or decrementing `likesCount`.
* **Comprehensive Firestore Security Rules (`firestore.rules`)**: 290 lines of relational security rules enforcing field-level immutability (`authorId`, `createdAt`), strict schema shape validation, and transaction validation via `existsAfter()` and `getAfter()`.
* **Deterministic Canonical Connection Schema**: Connection documents use a lexicographical sorted-pair ID (`min(A, B) + "_" + max(A, B)`). This invariant enforces exactly one relationship document per pair, eliminating duplicate requests and race conditions.
* **Scoped Reads & Data Isolation**: Notifications reside in user-scoped subcollections (`users/{userId}/notifications/{id}`). Reads and updates are restricted to the authenticated recipient directly by Firestore Security Rules.
* **Bounded Queries & Real-Time Listeners**: The global feed is bounded to 50 posts and student discovery is bounded to 100 profiles with client-side multi-field filtering, avoiding unbounded scan costs while maintaining real-time updates.
* **Service-Layer Separation**: UI components contain zero direct Firestore queries. All database operations, transactions, and snapshot listeners are encapsulated in dedicated modules under `src/services/`.
* **In-App Security Test Runner**: Embedded test suite (`src/components/dev/SecurityTestPanel.jsx`) that runs automated client-side tests in the browser to verify that unauthorized mutations (cross-user writes, email tampering, privilege escalations) are rejected by security rules.

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend Framework** | React 19 (`^19.2.5`), React DOM 19, Vite 8 (`^8.0.10`) |
| **Routing** | React Router DOM v7 (`^7.14.2`) |
| **Styling & Design System** | Tailwind CSS v4 (`^4.2.4`, `@tailwindcss/vite`), `@theme` CSS custom properties |
| **Micro-Interactions** | Motion for React (`^13.2.0`), Lucide React icons (`^1.41.0`) |
| **Backend & Database** | Firebase Web SDK v12 (`^12.15.0`) — Firebase Authentication & Cloud Firestore |
| **Admin & Seeding** | Firebase Admin SDK v14 (`^14.3.0`, devDependency) |
| **Code Quality** | ESLint 10 (`^10.2.1`), PostCSS 8 |

---

## Local Development Setup

### Prerequisites
* **Node.js**: v20.0.0 or higher (v22 tested)
* **npm**: v10.0.0 or higher

### Installation

1. **Clone the repository**:
   ```bash
   git clone <your-repository-url>
   cd campus-connect
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   Copy the example environment file:
   ```bash
   cp .env.example .env.local
   ```
   Populate `.env.local` with your Firebase web configuration:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project_id.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
   VITE_FIREBASE_APP_ID=your_web_app_id

   # Optional: local demo student 1-click access
   VITE_DEMO_USER_EMAIL=demo.student@campusconnect.edu
   VITE_DEMO_USER_PASSWORD=your_local_demo_password
   ```

4. **Start the development server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Local Demo Data Seeding

> **Note**: The hosted live demo ([campusconnect-cf191.web.app](https://campusconnect-cf191.web.app)) is already seeded. You only need to run this script if you are setting up your own separate Firebase project locally.

The repository includes a deterministic, whitelist-guarded seeding script (`scripts/seedDemoData.mjs`):

```bash
npm run seed:demo
```

### Safety & Whitelist Boundaries
* **Strict Whitelist**: The seeder can only write to predetermined IDs (`demo_peer_*`, `demo_post_01`–`demo_post_10`, and the dynamically resolved UID for `demo.student@campusconnect.edu`).
* **Zero Deletion**: All writes use idempotent `.set(..., { merge: true })`. There are no delete queries or bulk clearance routines.
* **Credential Security**: The script looks for a Service Account Key at `scripts/credentials/serviceAccountKey.json` (strictly git-ignored) or Google Application Default Credentials. **Never commit service-account credentials to the repository.**

---

## Project Structure

```
campus-connect/
├── public/                 # Static assets
├── scripts/
│   └── seedDemoData.mjs    # Deterministic demo seeding script
├── src/
│   ├── components/
│   │   ├── dev/            # SecurityTestPanel in-app test harness
│   │   ├── feed/           # Feed, PostCard, PostComposer, CommentList, CommentComposer
│   │   ├── layout/         # Navbar, PageContainer, Section
│   │   ├── notifications/  # NotificationItem
│   │   ├── search/         # StudentCard
│   │   └── ui/             # Avatar, Button, Card, Input, Textarea, EmptyState
│   ├── contexts/           # AuthContext (session state and observer)
│   ├── data/               # demoData.js (personas, posts, whitelists)
│   ├── firebase/           # config.js (client SDK initialization)
│   ├── hooks/              # useAuth custom hook
│   ├── pages/              # Login, Register, Dashboard, Profile, PublicProfile,
│   │                       # Discover, Connections, Notifications, Settings, NotFound
│   ├── services/           # authService, userService, postService, likeService,
│   │                       # commentService, connectionService, notificationService
│   ├── utils/              # securityTestRunner.js
│   ├── App.jsx             # React Router configuration
│   ├── index.css           # Tailwind v4 @theme design tokens
│   └── main.jsx            # React root mount
├── firestore.rules         # Production Firestore security rules (290 lines)
├── firebase.json           # Firebase Hosting & Firestore deployment configuration
├── .env.example            # Documented environment variable template
└── package.json            # Scripts, dependencies, and project metadata
```

---

## Verification & Build

```bash
# Run ESLint verification
npm run lint

# Compile production bundle
npm run build

# Preview production build locally
npm run preview
```
