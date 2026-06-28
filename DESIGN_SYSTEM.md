# DESIGN_SYSTEM.md

# CampusConnect Design System

## Design Philosophy

CampusConnect should feel like a modern SaaS application rather than a typical college project.

The UI should communicate:

- simplicity
- professionalism
- trust
- speed
- consistency

The application should feel polished enough that it could realistically be used by students at a university.

---

# Design Inspiration

Primary inspiration:

- Linear
- GitHub
- Notion
- Discord
- Threads
- Vercel Dashboard

Avoid copying these products.

Instead, follow the same design principles:

- clean layouts
- generous whitespace
- subtle shadows
- rounded corners
- consistent spacing
- modern typography

---

# Visual Style

The application should feel:

- modern
- minimal
- lightweight
- responsive
- accessible
- friendly

Avoid visual clutter.

Every page should have a clear visual hierarchy.

---

# Color Palette

## Primary

Indigo

HEX

#4F46E5

Hover

#4338CA

Pressed

#3730A3

---

## Secondary

Slate Gray

#64748B

---

## Success

#22C55E

---

## Warning

#F59E0B

---

## Error

#EF4444

---

## Information

#3B82F6

---

# Neutral Colors

Background

#F8FAFC

Surface

#FFFFFF

Surface Hover

#F1F5F9

Border

#E2E8F0

Divider

#CBD5E1

Primary Text

#0F172A

Secondary Text

#64748B

Muted Text

#94A3B8

Disabled

#CBD5E1

---

# Typography

Font Family

Inter

Hierarchy

Display

48px

Heading 1

36px

Heading 2

30px

Heading 3

24px

Heading 4

20px

Body Large

18px

Body

16px

Small

14px

Caption

12px

Use font-weight consistently:

Regular

Medium

Semibold

Bold

Avoid excessive font weights.

---

# Border Radius

Buttons

12px

Cards

16px

Inputs

12px

Modals

20px

Avatars

Full Circle

---

# Shadows

Use soft shadows.

Small

Cards

Medium

Dropdowns

Large

Modals

Avoid dramatic shadows.

---

# Spacing System

Use an 8px spacing system.

Available spacing:

4

8

12

16

20

24

32

40

48

64

96

Never use inconsistent spacing.

---

# Layout

Desktop

Left Sidebar

Main Feed

Right Sidebar (optional)

Maximum content width:

1280px

Use generous padding.

Maintain consistent margins throughout.

---

# Navigation

Top Navigation

Contains:

- Logo
- Search
- Notifications
- Messages
- User Menu

Sidebar

Contains:

- Home
- Explore
- Friends
- Messages
- Notifications
- Events
- Clubs
- Marketplace
- Saved
- Profile
- Settings

Primary action:

Create Post

---

# Buttons

Primary

Filled

Indigo

White text

Secondary

Outlined

Ghost

Transparent

Danger

Red

Loading state required.

Disabled state required.

Hover animation should be subtle.

---

# Cards

Cards should have:

- white background
- rounded corners
- soft shadow
- generous padding

Cards should never appear cramped.

---

# Inputs

Rounded

Clear labels

Focus ring

Accessible contrast

Validation messages below input.

Required fields clearly indicated.

---

# Forms

Every form should include:

- loading state
- validation
- helpful error messages
- disabled submit button during loading

Never allow duplicate submissions.

---

# Icons

Use Lucide React icons.

Use one consistent icon library throughout the application.

---

# Images

Rounded corners.

Lazy load where appropriate.

Show placeholders while loading.

---

# Avatars

Circular.

Support:

- image
- initials fallback

Consistent sizing across the application.

---

# Badges

Use badges for:

- year
- department
- role
- status

Avoid excessive badge usage.

---

# Empty States

Every feature should have a proper empty state.

Example:

No posts yet.

Be the first to share something.

Provide an action button.

---

# Loading States

Prefer skeleton loaders.

Avoid large spinners whenever possible.

Use spinners only for short loading operations.

---

# Modals

Centered.

Rounded.

Soft shadow.

Close button.

ESC key support.

Background overlay.

---

# Animations

Animations should be subtle.

Examples:

Hover elevation

Button press

Fade in

Slide up

Duration:

150–250ms

Avoid:

- bouncing
- excessive scaling
- flashy transitions

---

# Accessibility

Support:

- keyboard navigation
- visible focus states
- semantic HTML
- screen readers
- sufficient contrast

Never rely on color alone to communicate information.

---

# Responsiveness

The application must work on:

Desktop

Tablet

Mobile

Sidebar should collapse on smaller screens.

Navigation should remain accessible.

Avoid horizontal scrolling.

---

# Component Principles

Every component should be:

Reusable

Composable

Predictable

Well documented

Accessible

Avoid duplicate implementations.

---

# User Experience

Users should always know:

- where they are
- what they can do next
- whether an action succeeded
- whether an action failed

Feedback should be immediate.

---

# Overall Feel

CampusConnect should feel like a modern startup product.

When designing any new page or component, prioritize:

- clarity
- consistency
- simplicity
- usability
- responsiveness
- accessibility

If a design decision is uncertain, choose the simpler option.

Consistency is more important than visual novelty.

---

# Visual Refinements (v2)

The following design decisions supersede earlier generic guidelines and should be treated as the preferred implementation across the application.

## Overall Feel

CampusConnect should resemble a polished SaaS application rather than a traditional college project.

Design inspiration remains:

- Linear
- GitHub
- Notion
- Threads
- Discord
- Vercel Dashboard

Prioritize:

- generous whitespace
- subtle elevation
- consistent spacing
- clean typography
- calm color palette
- minimal visual noise

Avoid adding visual effects simply because they look impressive.

---

# Profile Layout

The profile page is the visual identity of every user.

Requirements:

- Cover banner at the top.
- Circular avatar overlapping the lower portion of the banner.
- User information must never overlap the banner.
- Maintain generous spacing between:
  - banner
  - avatar
  - user information

- Profile cards should feel spacious rather than compressed.

Future profile enhancements should integrate naturally into this layout.

---

# Typography

User-generated content should always preserve formatting.

Examples:

- Bio
- About
- Posts
- Comments
- Messages

Render multiline text correctly.

Never collapse intentional line breaks into a single paragraph.

---

# Card Design

Cards are the primary content container throughout CampusConnect.

Requirements:

- white background
- subtle border
- soft shadow
- rounded corners
- generous padding
- consistent spacing

Cards should support:

- optional header
- optional footer
- optional actions

Avoid visually heavy cards.

---

# Feed Design

The feed is the primary focus after authentication.

Posts should feel lightweight.

Each post should have clear visual separation using spacing rather than heavy borders.

Content hierarchy:

Avatar

↓

Author

↓

Timestamp

↓

Post Content

↓

Actions

---

# Buttons

Interactive elements should provide subtle feedback.

Preferred interactions:

- hover elevation
- slight color transition
- loading spinner
- disabled opacity

Avoid exaggerated animations.

---

# Icons

Icons should enhance readability.

Preferred usage:

- section titles
- navigation
- actions
- metadata

Avoid decorative icons without purpose.

Use Lucide React consistently.

---

# Empty States

Every feature must include a thoughtful empty state.

Examples:

No posts yet.

No comments yet.

No notifications yet.

No friends yet.

Include:

- meaningful icon
- concise explanation
- primary action

---

# Loading States

Prefer skeleton loaders.

Use spinners only for short operations.

Loading should never cause large layout shifts.

---

# Future Visual Enhancements

These are intentionally deferred until later milestones:

- Dark mode
- Theme switching
- Profile cover customization
- Profile picture upload
- Image posts
- Rich media
- Motion enhancements

The application should remain clean and consistent before introducing advanced visual effects.
