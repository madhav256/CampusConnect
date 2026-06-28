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
