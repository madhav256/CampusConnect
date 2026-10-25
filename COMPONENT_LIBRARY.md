# CampusConnect Component Library

**Status:** Current component inventory and reuse guidance (Milestone 24 Delivered)

This document describes components that exist in `src/components/`. It is not a catalog of speculative or deferred components. Page-local components remain inside their page until reuse is justified.

## Active component tree

```text
src/components/
├── ProtectedRoute.jsx
├── community/
│   ├── CommunityCard.jsx
│   ├── CommunityCategoryBadge.jsx
│   ├── CommunityGrid.jsx
│   ├── CommunityHero.jsx
│   ├── CommunityMembersPreview.jsx
│   ├── CommunityModerationPanel.jsx
│   ├── CommunityPostComposer.jsx
│   └── CommunityPostFeed.jsx
├── dev/
│   └── SecurityTestPanel.jsx
├── events/
│   ├── CapacityIndicator.jsx
│   ├── EventAttendeePreview.jsx
│   ├── EventCancelModal.jsx
│   ├── EventCard.jsx
│   ├── EventCategoryBadge.jsx
│   ├── EventComposerModal.jsx
│   ├── EventDeleteModal.jsx
│   ├── EventEditModal.jsx
│   ├── EventFilterBar.jsx
│   ├── EventGrid.jsx
│   ├── EventManagementToolbar.jsx
│   ├── EventRepublishModal.jsx
│   ├── EventRsvpButton.jsx
│   ├── EventStatusBadge.jsx
│   ├── RsvpStatusBadge.jsx
│   ├── SeatClaimBanner.jsx
│   └── WaitlistModal.jsx
├── feed/
│   ├── CommentComposer.jsx
│   ├── CommentItem.jsx
│   ├── CommentList.jsx
│   ├── Feed.jsx
│   ├── PostCard.jsx
│   └── PostComposer.jsx
├── layout/
│   ├── Navbar.jsx
│   ├── PageContainer.jsx
│   └── Section.jsx
├── messages/
│   ├── ConversationItem.jsx
│   ├── ConversationList.jsx
│   ├── DisconnectedNotice.jsx
│   ├── MessageBubble.jsx
│   ├── MessageComposer.jsx
│   └── MessageThread.jsx
├── notifications/
│   └── NotificationItem.jsx
├── search/
│   └── StudentCard.jsx
└── ui/
    ├── Avatar.jsx
    ├── Button.jsx
    ├── Card.jsx
    ├── EmptyState.jsx
    ├── ErrorBoundary.jsx
    ├── Input.jsx
    └── Textarea.jsx
```

## Component boundaries

- Pages compose screens, forms, tabs, and page-specific state.
- Feature components render domain interactions and use hooks or callback props.
- UI components remain generic and do not call Firebase directly.
- Firestore and Auth calls belong in `src/services/` or server microservice workers in `src/server/`.
- A component should not be extracted merely because it contains JSX; extract when it has a reusable responsibility or a clear independent state boundary.

---

## UI primitives (`src/components/ui/`)

### `Button`
File: `src/components/ui/Button.jsx`
Shared button component supporting variants (`primary`, `secondary`, `outline`, `ghost`, `danger`), sizes (`sm`, `md`, `lg`), loading spinner with `loadingText`, disabled states, keyboard focus styling, and standard button HTML attributes.

### `Card`
File: `src/components/ui/Card.jsx`
Bordered surface container with configurable padding (`none`, `sm`, `md`, `lg`), shadows, hover transitions, and standard div props. Primary container for feed posts, profiles, settings, and cards.

### `Avatar`
File: `src/components/ui/Avatar.jsx`
Displays an image when `photoURL` is present; falls back to up to two initials derived from `name`. Sizes: `xs`, `sm`, `md`, `lg`, `xl`. Supports `bordered` ring styling.

### `Input`
File: `src/components/ui/Input.jsx`
Accessible labeled input wrapper linking validation/error text through `aria-describedby` and marking invalid fields with `aria-invalid`. Supports `id`, `label`, `error`, `helperText`, and standard input props.

### `Textarea`
File: `src/components/ui/Textarea.jsx`
Accessible labeled textarea wrapper with error, helper text, and validation conventions matching `Input`.

### `EmptyState`
File: `src/components/ui/EmptyState.jsx`
Standard empty-state surface with optional icon, title, description, and action button. Supports `compact` mode for smaller sections.

### `ErrorBoundary`
File: `src/components/ui/ErrorBoundary.jsx`
Top-level React error boundary catching unhandled rendering exceptions and rendering an accessible fallback card with a reload action.

---

## Layout components (`src/components/layout/`)

### `Navbar`
File: `src/components/layout/Navbar.jsx`
Authenticated top navigation bar providing brand link, desktop/mobile navigation links (Dashboard, Discover, Communities, Events, Messages, Notifications, Settings, Profile), active unread badges for messages and notifications, mobile drawer toggle, signed-in avatar, and skip-to-main-content accessibility link.

### `PageContainer`
File: `src/components/layout/PageContainer.jsx`
Semantic `<main>` container with `main-content` ID, focus target, responsive padding, entrance animation, and configurable `maxWidth` (default `max-w-5xl`).

### `Section`
File: `src/components/layout/Section.jsx`
Semantic content section with title, optional subtitle, action slot, and children.

---

## Navigation & Access (`src/components/`)

### `ProtectedRoute`
File: `src/components/ProtectedRoute.jsx`
Route wrapper verifying Firebase Auth state. Renders loading skeleton while initializing; redirects unauthenticated visitors to `/` while preserving attempted target location.

---

## Feed components (`src/components/feed/`)

- **`Feed.jsx`:** Connects `usePosts` to composer, list, loading skeletons, and error retry states.
- **`PostComposer.jsx`:** Text-only post composer with validation and loading states.
- **`PostCard.jsx`:** Renders author snapshot, timestamp, post content, author-only delete confirmation, like button with Motion animation, and expandable `CommentList`.
- **`CommentList.jsx`:** Subscribes to post comments via `useComments` and renders composer and comments.
- **`CommentComposer.jsx`:** Auto-resizing textarea with Enter-to-submit and loading states.
- **`CommentItem.jsx`:** Comment card with author avatar, timestamp, multiline text, and author-only delete.

---

## Search & Discovery (`src/components/search/`)

- **`StudentCard.jsx`:** Bounded discovery card showing student avatar, name, department, year, skills tags, and profile link.

---

## 1-to-1 Private Messaging (`src/components/messages/`)

- **`ConversationList.jsx`:** Renders list of active conversations with peer avatar, last message preview, timestamp, and unread badges.
- **`ConversationItem.jsx`:** Individual conversation card in the sidebar.
- **`MessageThread.jsx`:** Active message thread rendering chronologically sorted bubbles, date separators, and scroll management.
- **`MessageBubble.jsx`:** Incoming/outgoing message bubble with timestamp and status.
- **`MessageComposer.jsx`:** Text composer for sending messages in an active thread.
- **`DisconnectedNotice.jsx`:** Informational banner rendered when peers are no longer connected, indicating read-only archive mode.

---

## Notifications (`src/components/notifications/`)

### `NotificationItem`
File: `src/components/notifications/NotificationItem.jsx`
Renders an in-app notification with actor avatar, title, relative timestamp, unread indicator, and action CTAs:
- `connection_request`: Inline Accept and Decline actions.
- `connection_accepted`: "View Profile" CTA linking to `/users/:actorId`.
- `event_rsvp`: "View Event" CTA linking to `/events/:referenceId`.
- `event_cancelled`: "View Event" CTA linking to `/events/:referenceId` with cancellation badge and durable `referenceTitle`.
- `event_waitlist_offer`: "View Event" CTA linking to `/events/:referenceId` with seat offer alert where claim occurs.

---

## Communities (`src/components/community/`)

- **`CommunityCard.jsx`:** Directory card displaying community name, category, member count, description, and link.
- **`CommunityCategoryBadge.jsx`:** Categorical badge with distinct palette per category.
- **`CommunityGrid.jsx`:** Responsive grid container for community cards.
- **`CommunityHero.jsx`:** Community header banner with name, badges, member count, and Join/Leave button.
- **`CommunityMembersPreview.jsx`:** Member avatars preview list with role chips.
- **`CommunityModerationPanel.jsx`:** Leadership panel for managing roles and membership status.
- **`CommunityPostComposer.jsx`:** Community-scoped post composer.
- **`CommunityPostFeed.jsx`:** Filtered community discussion feed.

---

## Events & Waitlists (`src/components/events/`)

### Core Event UI
- **`EventCard.jsx`:** Event card rendering banner image, date badge, title, organizer, category, visibility indicator, and Going badge.
- **`EventGrid.jsx`:** Responsive grid container for event cards.
- **`EventCategoryBadge.jsx`:** Categorical badge for the 8 canonical event categories.
- **`EventStatusBadge.jsx`:** Status badge (`published`, `cancelled`, `upcoming`, `ongoing`, `past`).
- **`EventFilterBar.jsx`:** Search input, category pills, and community filter dropdown.
- **`EventAttendeePreview.jsx`:** Attendee headcount card with up to 8 avatar chips and overflow indicator.
- **`EventRsvpButton.jsx`:** Interactive RSVP toggle button ("Attend Event", "Cancel RSVP", "Join Waitlist", "Claim Seat").
- **`RsvpStatusBadge.jsx`:** Attendee status badge (`going`, `not_going`, `attended`, `cancelled`).

### Event Lifecycle Management Modals
- **`EventComposerModal.jsx`:** Form dialog for community leaders to publish new campus events.
- **`EventManagementToolbar.jsx`:** Leader toolbar on `/events/:eventId` exposing edit, cancel, republish, and delete actions.
- **`EventEditModal.jsx`:** Adaptive mutability modal for editing event details within lifecycle rules.
- **`EventCancelModal.jsx`:** Cancellation dialog initiating registration closure and cancellation fan-out.
- **`EventRepublishModal.jsx`:** Republishing dialog restoring cancelled upcoming events to published status.
- **`EventDeleteModal.jsx`:** Administrator hard-delete dialog with irreversible warning.

### Capacity & Waitlist Components (Milestone 24 Delivered)

#### `CapacityIndicator`
File: `src/components/events/CapacityIndicator.jsx`
Export: `default function CapacityIndicator(props)`

**Responsibilities:**
Visual indicator displaying live capacity occupancy, vacancy counts, capacity progress bar, and waitlist badge for campus events.

**Props:**
| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `event` | object | `null` | Event document object |
| `eventId` | string | `null` | Event ID used to subscribe to coordinator if coordinator is not passed |
| `coordinator` | object | `null` | Direct coordinator document override |
| `metrics` | object | `null` | Direct metrics override |
| `showProgress` | boolean | `true` | Whether to render the visual progress bar |
| `size` | string | `"md"` | Size variant: `"sm"`, `"md"`, `"lg"` |
| `className` | string | `""` | Additional CSS classes |

**Behavior:**
- For uncapped open events (`isCappedEvent(event) == false`), renders "Open Event (Uncapped)" badge with `Users` icon.
- For capped events, calculates percent occupied: `Math.round((allocatedSeats / capacity) * 100)`.
- Renders occupancy bar with color coding (slate < 80%, amber >= 80%, terracotta/red = 100% full).
- Displays headcount text (`${allocatedSeats} / ${capacity} spots filled`).
- Renders waitlist count badge (`+N on waitlist`) when `waitlistCount > 0`.

---

#### `SeatClaimBanner`
File: `src/components/events/SeatClaimBanner.jsx`
Export: `default function SeatClaimBanner(props)`

**Responsibilities:**
Prominent sticky banner displayed at the top of `/events/:eventId` when a student on the waitlist receives an offered seat. Features a live countdown timer and interactive Claim and Decline actions.

**Props:**
| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `eventId` | string | `null` | Target event ID |
| `userId` | string | `null` | Current student user ID |
| `slot` | object | `null` | Direct slot document override |
| `isOffered` | boolean | `undefined` | Direct offered state override |
| `timeRemainingMs` | number | `undefined` | Direct remaining milliseconds override |
| `onClaim` | function | `null` | Direct async Claim handler override |
| `onDecline` | function | `null` | Direct async Decline handler override |
| `className` | string | `""` | Additional CSS classes |

**Behavior:**
- Renders `null` if there is no active offer (`activeIsOffered == false`) or if the offer window has elapsed (`activeTimeRemaining <= 0`).
- Displays live countdown timer formatted as `HH:MM:SS`.
- Primary CTA **"Claim Seat"**: invokes `claimWaitlistOffer` callable, claims seat, and registers attendee RSVP.
- Secondary CTA **"Decline"**: renders confirmation prompt ("Decline offer and let next student register?"), then invokes `declineWaitlistOffer` callable.
- Provides accessible `role="alert"` container with error and loading states.

---

#### `WaitlistModal`
File: `src/components/events/WaitlistModal.jsx`
Export: `default function WaitlistModal(props)`

**Responsibilities:**
Modal dialog enabling students to join a full event's waitlist, view their current queue position, review reservation policies, and withdraw if needed.

**Props:**
| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `isOpen` | boolean | `false` | Whether modal dialog is open |
| `onClose` | function | (required) | Close handler callback |
| `event` | object | (required) | Target event document object |
| `user` | object | `null` | Current student user object |
| `coordinator` | object | `null` | Direct coordinator document override |
| `isOnWaitlist` | boolean | `undefined` | Direct waitlist presence override |
| `queuePosition` | number | `undefined` | Direct queue position override |
| `slot` | object | `null` | Direct slot document override |
| `onJoin` | function | `null` | Direct async Join handler override |
| `onLeave` | function | `null` | Direct async Leave handler override |
| `className` | string | `""` | Additional CSS classes |

**Behavior:**
- Handles both pre-join and post-join waitlist views.
- **Pre-join view:** Displays estimated position (`nextSequence - headSequence + 1`), policy explanations (24-hour claim window upon offer, auto-promotion), and primary **"Join Waitlist"** action.
- **Post-join view:** Displays confirmed position badge ("You are #N in line"), status explanation, and secondary **"Leave Waitlist"** action with inline confirmation.
- Accessible dialog semantics: focus trap, Escape key dismiss, backdrop click, and `aria-modal="true"`.

---

## Development components (`src/components/dev/`)

### `SecurityTestPanel`
File: `src/components/dev/SecurityTestPanel.jsx`
Development-only audit panel used by Settings and Notifications to test Firestore Rule rejection scenarios for notifications and private user documents. Guarded against production builds.
