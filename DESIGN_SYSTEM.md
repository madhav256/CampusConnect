# CampusConnect Design System

**Status:** Active Campus Atelier visual reference (Milestone 13A)

This document describes the visual system implemented in `src/index.css` and the active components. Older indigo/slate guidance is obsolete.

## Design direction

CampusConnect uses **The Campus Atelier** visual language: an editorial, warm, restrained interface for academic collaboration.

Priorities:

- clarity over decoration;
- generous but efficient whitespace;
- warm paper and surface layers;
- strong ink contrast;
- terracotta actions and focus cues;
- Newsreader headings paired with Inter body text;
- purposeful, restrained motion;
- responsive and keyboard-accessible interaction.

The system should feel like a considered campus publication and studio workspace rather than a generic social-media dashboard.

## Implemented color tokens

The active Tailwind theme in `src/index.css` defines:

| Token | Purpose |
| --- | --- |
| `paper` | Main warm page background (`#fbf9f5`) |
| `paper-warm` | Secondary warm background (`#f5f2eb`) |
| `surface` | White content surface (`#ffffff`) |
| `ink` | Primary text (`#181614`) |
| `ink-muted` | Secondary text (`#6e6962`) |
| `border-warm` | Warm border (`#e8e4dc`) |
| `terracotta-50` through `terracotta-800` | Accent, action, focus, and status tones |

Use the existing token classes instead of reintroducing indigo, slate, blue, or an unrelated color scale.

Rose, amber, emerald, and stone utility tones are used selectively for error, warning, success, and neutral states.

## Typography

- Display and section headings use `font-serif`, backed by Newsreader with Georgia fallback.
- Body, labels, controls, and metadata use `font-sans`, backed by Inter and system sans fallbacks.
- Use clear hierarchy rather than excessive font weights.
- Preserve intentional line breaks in bios, posts, and comments with appropriate whitespace classes.
- Keep headings editorial but concise; body text should remain readable at mobile widths.

## Surfaces and shape

- Cards use warm borders, white surfaces, rounded corners, and restrained shadows.
- Inputs and controls use rounded corners, clear labels, and visible focus rings.
- Avatars are circular and use an initials fallback when no image URL exists.
- Prefer spacing and hierarchy over heavy dividers.
- Avoid excessive nested cards and dramatic shadows.

## Layout and navigation

- Authenticated pages use the sticky `Navbar` and `PageContainer`.
- `PageContainer` defaults to a centered `max-w-5xl` content region with responsive padding.
- The feed itself is narrower (`max-w-2xl`) to preserve readable line length.
- Profile, settings, and public-profile content use responsive grids that collapse on smaller screens.
- The Navbar contains Dashboard, Discover, Connections, Notifications, Settings, and Profile.
- Mobile navigation is a menu, not a desktop sidebar.
- Do not add messages, events, clubs, marketplace, or saved-post navigation until those features exist.

## Component usage

Use the active primitives:

- `Button` for shared action variants, sizes, loading, and disabled states;
- `Card` for bordered content surfaces;
- `Avatar` for image/initial identity;
- `Input` and `Textarea` for labeled form controls and validation messaging;
- `EmptyState` for no-data states with optional actions;
- `PageContainer` for page-level main content;
- `Section` for titled card sections.

Feature components should keep domain behavior in hooks/services and should not create competing visual primitives.

## Interaction and motion

Motion is used for meaningful feedback, including:

- like-button feedback;
- expandable comment content;
- short page entrance and mobile-menu transitions.

Keep transitions subtle and short. Do not add motion merely for decoration. The global stylesheet includes a `prefers-reduced-motion: reduce` rule that disables or minimizes transitions and animations.

## State presentation

Every asynchronous page or feature should account for:

- loading placeholders or skeleton-style blocks;
- an actionable error state where possible;
- empty state when no data exists;
- disabled controls during writes;
- success feedback for settings/profile saves when appropriate.

Do not expose raw Firestore or Auth errors when a concise user-facing message is available.

## Accessibility

- Use semantic headings and sections.
- Label inputs and connect helper/error messages with ARIA attributes.
- Use buttons for actions and links for navigation.
- Preserve visible focus states.
- Include accessible names for icon-only controls.
- Provide a skip-to-main-content link in authenticated navigation.
- Do not communicate an important state with color alone.
- Keep tap targets and text readable on mobile.

## Responsive behavior

The interface must work at mobile, tablet, and desktop widths:

- navigation collapses into the mobile menu;
- cards and profile grids reflow;
- controls wrap rather than force horizontal scrolling;
- content remains readable within the page container;
- loading and empty states avoid large layout shifts.

## Deferred visual work

The following are not active design-system capabilities:

- dark mode or theme switching;
- profile image or cover uploads;
- image posts and rich media;
- messaging-specific UI;
- advanced motion effects;
- custom user themes.

They should be designed as extensions of Campus Atelier rather than reasons to replace the current system.
