# CampusConnect Component Library

**Status:** Current component inventory and reuse guidance (Milestone 13A)

This document describes components that exist in `src/components/`. It is not a catalog of future components. Page-local components remain inside their page until reuse is justified.

## Active component tree

```text
src/components/
├── dev/
│   └── SecurityTestPanel.jsx
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
├── notifications/
│   └── NotificationItem.jsx
├── search/
│   └── StudentCard.jsx
└── ui/
    ├── Avatar.jsx
    ├── Button.jsx
    ├── Card.jsx
    ├── EmptyState.jsx
    ├── Input.jsx
    └── Textarea.jsx
```

There are no active `auth`, `profile`, `messaging`, `common`, `sidebar`, or `modal` component folders.

## Component boundaries

- Pages compose screens, forms, tabs, and page-specific state.
- Feature components render domain interactions and use hooks or callback props.
- UI components remain generic and do not call Firebase.
- Firestore/Auth calls belong in `src/services/`, normally reached through hooks or page-level service handlers.
- A component should not be extracted merely because it contains JSX; extract when it has a reusable responsibility or a clear independent state boundary.

## UI primitives

### `Button`

File: `src/components/ui/Button.jsx`

A shared button with:

- `primary`, `secondary`, `outline`, `ghost`, and `danger` variants;
- `sm`, `md`, and `lg` sizes;
- `loading` and optional `loadingText`;
- disabled behavior that also disables while loading;
- keyboard focus styling and a consistent press transition;
- arbitrary native button props through rest props.

Use it for ordinary actions and forms. Use a native button only when a page needs a specialized interaction that does not fit the shared API.

### `Card`

File: `src/components/ui/Card.jsx`

A bordered surface container with:

- `none`, `sm`, `md`, and `lg` padding;
- `none`, `sm`, `md`, and `lg` shadows;
- optional `hoverable` behavior;
- `className` and native div props.

Cards are the primary content surfaces for feed posts, profiles, settings, notifications, and empty/error states.

### `Avatar`

File: `src/components/ui/Avatar.jsx`

Displays an image when `photoURL` is present and otherwise renders up to two initials. Supported sizes are `xs`, `sm`, `md`, `lg`, and `xl`. `bordered` controls the surface ring; `name`, `photoURL`, and `className` provide identity and styling.

The current application intentionally supports initials fallback because media upload is not implemented.

### `Input`

File: `src/components/ui/Input.jsx`

A labeled native input wrapper. It supports `id`, `label`, `required`, `error`, `helperText`, and all remaining native input props. It links validation/helper text through `aria-describedby` and marks invalid fields with `aria-invalid`.

### `Textarea`

File: `src/components/ui/Textarea.jsx`

A labeled native textarea wrapper with the same error, helper-text, required, and accessibility conventions as `Input`. It is used by profile, post, and form flows.

`CommentComposer` uses a specialized native textarea because it needs auto-resizing and Enter-to-submit behavior.

### `EmptyState`

File: `src/components/ui/EmptyState.jsx`

Displays an optional icon, title, description, and action. The `compact` prop provides a smaller page-section version. It is used by feed, discovery, connections, notifications, and the not-found page.

## Layout components

### `Navbar`

File: `src/components/layout/Navbar.jsx`

The authenticated top navigation. It provides:

- CampusConnect brand link;
- links to Dashboard, Discover, Connections, Notifications, Settings, and Profile;
- notification unread badge from `useNotifications`;
- responsive mobile menu;
- signed-in avatar link;
- skip-to-main-content link;
- keyboard focus states.

It does not contain messages, events, clubs, marketplace, or saved-post navigation.

### `PageContainer`

File: `src/components/layout/PageContainer.jsx`

Renders the semantic `<main>` region with the `main-content` ID, focus target, responsive padding, entrance animation, and configurable `maxWidth`. The default width is `max-w-5xl`.

### `Section`

File: `src/components/layout/Section.jsx`

A semantic content section with a title, optional subtitle, optional action area, and children. It is used in profile and similar card-based layouts.

## Feed components

### `Feed`

File: `src/components/feed/Feed.jsx`

Connects `usePosts` to the post composer and post list. It owns feed-level loading, error, and empty rendering, and passes the current Auth UID and delete callback to each `PostCard`.

It does not query Firestore directly.

### `PostComposer`

File: `src/components/feed/PostComposer.jsx`

A text-only post form using `Textarea`, `Button`, and `Avatar`. It prevents empty submission, disables the form while submitting, clears successful content, and displays a local error.

### `PostCard`

File: `src/components/feed/PostCard.jsx`

Renders an author snapshot, timestamp, text content, author-only delete confirmation, like action, comment count, and expandable `CommentList`. It uses `usePostLike` and Motion for the like/expand transitions.

There is no media, share, bookmark, edit, or repost action.

### `CommentList`

File: `src/components/feed/CommentList.jsx`

Subscribes through `useComments`, renders `CommentComposer`, and displays loading, error, empty, or `CommentItem` states.

### `CommentComposer`

File: `src/components/feed/CommentComposer.jsx`

A compact comment input with auto-resizing textarea, Enter-to-submit unless Shift is pressed, local error feedback, and loading state.

### `CommentItem`

File: `src/components/feed/CommentItem.jsx`

Renders a comment author avatar, author name, timestamp, multiline content, and an author-only delete action.

## Search components

### `StudentCard`

File: `src/components/search/StudentCard.jsx`

Renders a bounded discovery result with avatar/initials, display name, department, academic year, up to three skills plus a remainder count, and a link to `/users/:uid`.

The search input itself is page-local to `Discover`; there is no shared `SearchBar` component.

## Notification components

### `NotificationItem`

File: `src/components/notifications/NotificationItem.jsx`

Renders a notification actor, relative timestamp, unread state, profile link, mark-as-read action, dismissal action, and the appropriate accept/decline or view-profile action for the two active notification types:

- `connection_request`;
- `connection_accepted`.

It calls connection services for inline request actions through explicit callbacks and does not subscribe to Firebase itself.

## Development component

### `SecurityTestPanel`

File: `src/components/dev/SecurityTestPanel.jsx`

A development-only panel used by Settings and Notifications to run the Milestone 8 notification audit or Milestone 9 user/settings audit. It displays blocked/failed results and disposable-test cleanup reports.

It must not be rendered as a production feature. The underlying functions also guard against production execution.

## Page-local components

`Connections.jsx` contains page-local `PersonCard`, `PersonCardInner`, and `Tab` components. They are intentionally local because they combine connection-specific data loading and actions and are not currently reused elsewhere.

The route pages also contain small form, tab, and state-rendering structures. Do not create a generic component for every repeated JSX fragment without a demonstrated reuse case.

## Reuse and naming rules

Before adding a component:

1. Check whether an existing component already owns the responsibility.
2. Extend a generic primitive when the new behavior remains generic.
3. Keep domain-specific behavior in the relevant feature folder or page.
4. Keep Firebase operations out of reusable UI components.
5. Use singular PascalCase names that describe the responsibility.
6. Preserve loading, error, empty, disabled, and keyboard states where applicable.
7. Prefer semantic HTML and visible focus styles.

Avoid vague or speculative names such as `CardNew`, `Button2`, `Component1`, or a component for an unimplemented feature.

## Deferred component ideas

These do not exist in the current source tree and should be introduced only with their associated feature:

- messaging conversation/message components;
- post share/bookmark/edit controls;
- media upload and preview components;
- modal, dropdown, tooltip, badge, spinner, skeleton, and alert primitives;
- profile-specific extracted components;
- a sidebar or dashboard layout system;
- a reusable search-bar abstraction.

Their absence is intentional, not an incomplete implementation of this library.
