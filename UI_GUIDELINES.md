# CampusConnect UI Guidelines

**Status:** Active interface guidance (Milestone 13A)

## Visual language

Use the Campus Atelier system implemented by the application:

- warm paper backgrounds;
- white surfaces;
- ink and muted stone text;
- warm borders;
- terracotta primary actions and focus states;
- Newsreader serif headings;
- Inter sans-serif body text.

Do not introduce the obsolete generic blue/gray palette or a second design language.

## Layout

- Use `Navbar` on authenticated pages.
- Use `PageContainer` for the semantic main region and responsive page padding.
- Keep the feed readable at its narrower content width.
- Use responsive grids for profile, search, settings, and connection content.
- Let controls wrap on small screens; avoid horizontal scrolling.
- Keep page titles, supporting copy, and primary actions visually ordered.

## Surfaces and controls

- Use `Card` for a bounded content surface.
- Use `Button` for shared actions and its existing variants/sizes.
- Use `Input` and `Textarea` for labeled fields with validation/helper text.
- Use `Avatar` for image or initials identity.
- Use `EmptyState` for no-data views and include an appropriate next action when one exists.
- Use `Section` for titled subsections inside profile/settings surfaces.

Avoid creating one-off versions of these primitives.

## Forms and feedback

Every form or asynchronous action should provide:

- clear labels and validation;
- disabled controls while saving;
- loading feedback;
- concise success or error feedback;
- prevention of duplicate submission;
- preserved user content formatting where relevant.

Loading states should prefer the existing skeleton-style placeholders for page-sized reads. Use a spinner only for short button-level operations.

## Interaction and motion

- Use subtle hover, focus, and pressed feedback.
- Keep Motion animations purposeful and brief.
- Respect the global reduced-motion rule.
- Do not use animation to hide a slow or ambiguous state.
- Make action state visible through text, disabled behavior, and accessible labels, not color alone.

## Accessibility

- Use semantic HTML and a logical heading hierarchy.
- Associate labels, errors, and helper text with form controls.
- Keep keyboard focus visible.
- Use a button for an action and a link for navigation.
- Give icon-only controls an accessible name.
- Provide meaningful avatar alt/ARIA text and initials fallback.
- Preserve the skip-to-main-content path.
- Ensure contrast remains readable across paper, surface, terracotta, and status tones.

## Responsive behavior

Support mobile, tablet, and desktop:

- authenticated navigation becomes a mobile menu;
- profile and result cards reflow;
- tabs and action groups wrap;
- content remains inside the page container;
- empty/error states remain useful at narrow widths.

## Current navigation vocabulary

The active product navigation is:

- Dashboard
- Discover
- Connections
- Notifications
- Settings
- Profile

Messages, Events, Clubs, Marketplace, Saved, and Friends are not active navigation destinations.

## Deferred UI

Do not design or document these as current UI:

- messaging screens;
- media upload controls;
- post sharing/bookmarking controls;
- dark-mode controls;
- event, club, marketplace, or admin navigation.
