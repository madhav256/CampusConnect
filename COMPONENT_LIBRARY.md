# COMPONENT_LIBRARY.md

# CampusConnect Component Library

This document defines every reusable component in CampusConnect.

Before creating a new component:

1. Check whether an existing component already solves the problem.
2. Extend an existing component before creating a new one.
3. Keep components generic and reusable.
4. Avoid duplicate implementations.

---

# Folder Structure

```
src/
└── components/
    ├── ui/
    ├── layout/
    ├── auth/
    ├── profile/
    ├── feed/
    ├── search/
    ├── messaging/
    ├── notifications/
    └── common/
```

---

# UI Components

These are generic building blocks.

---

## Button

Purpose

Primary interaction component.

Variants

- primary
- secondary
- outline
- ghost
- danger

Sizes

- sm
- md
- lg

States

- default
- hover
- active
- disabled
- loading

Props

- variant
- size
- loading
- disabled
- icon
- children
- onClick
- type

Accessibility

- keyboard accessible
- proper focus state

---

## Input

Purpose

Standard text input.

Supports

- text
- email
- password
- search
- number

Props

- label
- placeholder
- value
- onChange
- error
- helperText
- required
- disabled

---

## Textarea

Purpose

Long-form text input.

Used for

- posts
- comments
- bio

Supports

- character count
- validation

---

## Card

Purpose

Reusable content container.

Used by

- posts
- profile
- settings
- dashboard widgets

Props

- children
- padding
- shadow
- hoverable

---

## Avatar

Purpose

Display user identity.

Supports

- image
- initials fallback

Sizes

- xs
- sm
- md
- lg
- xl

---

## Badge

Purpose

Display short metadata.

Examples

- department
- year
- admin
- verified

Variants

- default
- success
- warning
- danger
- info

---

## Spinner

Purpose

Loading indicator.

Sizes

- sm
- md
- lg

---

## Skeleton

Purpose

Loading placeholder.

Used while fetching data.

Avoid replacing every loading state with a spinner.

---

## Alert

Purpose

Display feedback.

Variants

- success
- warning
- error
- info

Dismissible when appropriate.

---

## EmptyState

Purpose

Displayed when no data exists.

Contains

- icon
- title
- description
- optional action button

---

## Modal

Purpose

Overlay dialog.

Must support

- close button
- escape key
- backdrop click
- focus trap

---

## Dropdown

Purpose

Context menus.

Examples

- profile menu
- post actions

---

## Tooltip

Purpose

Explain icons.

Should never contain essential information.

---

# Layout Components

---

## Navbar

Contains

- logo
- search
- notifications
- messages
- profile menu

Always visible after login.

---

## Sidebar

Contains navigation.

Supports

- desktop
- collapsed
- mobile drawer

---

## DashboardLayout

Provides

- navbar
- sidebar
- page container

Used by authenticated pages.

---

## AuthLayout

Used for

- login
- signup
- forgot password

Provides consistent authentication pages.

---

## PageContainer

Provides

- max width
- padding
- responsive spacing

Every page should use this component.

---

## Section

Reusable content section.

Supports

- title
- subtitle
- actions

---

# Profile Components

---

## ProfileHeader

Displays

- avatar
- name
- department
- year
- bio
- action buttons

---

## ProfileStats

Displays

- friends
- posts
- likes

---

## ProfileCard

Reusable information card.

---

## SkillsList

Displays user skills.

---

## SocialLinks

Displays

- GitHub
- LinkedIn
- Portfolio
- Website

---

# Feed Components

---

## PostComposer

Used to create posts.

Supports

- text
- image (future)
- emoji (future)

---

## PostCard

Displays

- author
- content
- media
- timestamp
- actions

---

## PostActions

Contains

- like
- comment
- share
- bookmark

---

## CommentList

Displays comments.

---

## CommentItem

Single comment.

---

# Search Components

---

## SearchBar

Reusable search component.

Supports

- debounce
- loading
- clear button

---

## UserCard

Search result card.

---

# Friends Components

---

## FriendCard

Displays

- avatar
- name
- department
- mutual friends

---

## FriendRequestCard

Displays pending requests.

---

# Messaging Components

---

## ConversationList

Sidebar conversation list.

---

## ChatWindow

Displays conversation.

---

## MessageBubble

Supports

- sent
- received

---

## MessageInput

Supports

- text
- attachments (future)

---

# Notifications

---

## NotificationItem

Displays

- icon
- message
- timestamp

Supports

- read
- unread

---

# Settings

---

## SettingsSection

Reusable settings group.

---

## ToggleSwitch

Reusable toggle.

---

## ConfirmDialog

Reusable confirmation dialog.

Used before destructive actions.

---

# Component Principles

Every component should be

- reusable
- composable
- responsive
- accessible
- documented
- independently testable

---

# Reuse Rules

Before creating a component:

Ask:

Can Button solve this?

Can Card solve this?

Can Section solve this?

Can PageContainer solve this?

Never create a second version of an existing component unless there is a compelling architectural reason.

---

# Naming Rules

Component names should be:

- descriptive
- singular
- PascalCase

Examples

Button

PostCard

ProfileHeader

MessageBubble

Avoid vague names.

Do not use:

Component1

CardNew

Button2

TempCard

---

# Definition of Done

A component is complete only if it:

- is reusable
- is responsive
- supports accessibility
- follows DESIGN_SYSTEM.md
- follows CODING_RULES.md
- is documented
- avoids duplicated logic
- can be reused elsewhere without modification

---

# Component Enhancements (v2)

These guidelines extend the existing component definitions.

## Button

Every button must support:

- loading state
- disabled state
- keyboard focus
- optional leading icon
- optional trailing icon

Primary buttons should be visually dominant.

---

## Card

Cards should support:

- header
- body
- footer
- optional actions

Cards should never contain excessive nesting.

Prefer composition over specialized card variants.

---

## Avatar

Avatar should support:

- image
- initials fallback

Future support:

- online indicator
- profile upload
- status badge

Avatar should align consistently across:

- profile
- feed
- comments
- messaging
- search

---

## Textarea

Textarea should support:

- multiline content
- preserved line breaks
- validation
- character count (future)

Rendered content should preserve user formatting.

---

## Section

Every page should be divided into reusable sections.

A section may contain:

- title
- subtitle
- actions
- children

Future support:

- collapsible sections

---

# Feed Components

## Feed

Responsibilities:

- render PostComposer
- render PostCard list
- loading state
- empty state
- error state

Feed must not directly query Firestore.

Use services and hooks.

---

## PostComposer

Responsibilities:

- create posts
- validate content
- prevent empty submissions
- loading state

Future support:

- image upload
- emoji picker
- markdown
- mentions

---

## PostCard

Responsibilities:

- display author
- timestamp
- content
- actions

Future support:

- likes
- comments
- bookmarks
- sharing
- edited badge

---

# Future Components

The following components should be introduced only when required by future milestones:

Comments

- CommentComposer
- CommentItem
- CommentList

Likes

- LikeButton

Notifications

- NotificationCard

Messaging

- ConversationList
- MessageBubble
- MessageComposer

Search

- UserSearchResult

Friends

- FriendCard
- FriendRequestCard

Settings

- SettingsCard
- PreferenceToggle

Avoid implementing these components until the associated feature is being developed.

---

# Reusability Rule

Before creating a new component, always ask:

Can an existing component be extended?

If yes, extend it.

If no, create a new reusable component.

Avoid one-off components unless they represent a unique feature.

---

# Visual Consistency

All reusable components must follow:

- DESIGN_SYSTEM.md
- consistent spacing
- accessible interactions
- responsive layouts
- predictable APIs

Consistency is more important than introducing new visual styles.
