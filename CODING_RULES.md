# CampusConnect Coding Rules

**Status:** Active engineering guidance (Milestone 13A)

These rules apply to work in this repository. They describe the current architecture and the standard for extending it without unnecessary complexity.

## General principles

- Prioritize correctness over speed.
- Prefer maintainability and clarity over cleverness.
- Keep solutions simple and scoped to the requested change.
- Preserve existing behavior unless the task requires a change.
- Do not introduce speculative architecture or technical debt.
- Treat the browser as untrusted when designing authorization or data integrity.

## Before making changes

1. Read the relevant source, service, hook, and documentation files.
2. Understand the current data flow and existing reusable patterns.
3. Explain the implementation plan and affected files.
4. Confirm whether the change affects routes, Firestore data, or Rules.
5. Preserve unrelated functionality.

## Scope and source layout

The active source layout is:

```text
src/
├── components/
├── contexts/
├── data/
├── firebase/
├── hooks/
├── pages/
├── services/
└── utils/
```

Do not create `layouts`, `routes`, `assets`, or feature folders solely because an older document mentions them. Add a folder only when the current feature has a clear responsibility that cannot fit an existing boundary.

## React and component design

- Use functional components and hooks.
- Keep components focused on one responsibility.
- Prefer composition over inheritance.
- Keep render logic readable and avoid deeply nested JSX where extraction helps.
- Keep state local unless it is genuinely shared.
- Use `AuthContext` only for authentication session state; do not turn it into a general domain store.
- Reuse `Button`, `Card`, `Avatar`, `Input`, `Textarea`, `EmptyState`, `PageContainer`, and `Section` before introducing another primitive.
- Keep page-specific components page-local when they are not reused.
- Avoid one-off abstractions that hide simple behavior.

## Firebase and service boundaries

- Keep Firebase Auth and Firestore SDK calls in `src/services/` or the established security-test utility.
- Do not place Firestore queries directly in reusable UI components.
- Use hooks for subscription lifecycle and local loading/error state.
- Return unsubscribe functions from `onSnapshot` effects.
- Validate input for user experience, but assume clients can bypass validation.
- Enforce ownership, field immutability, schema shape, and relationship invariants in Firestore Rules.
- Review read cost and listener lifetime before adding a query or subscription.
- Use transactions for relationship state and counters that must change together.
- Use batches when a bounded set of writes must commit together.
- Do not expose service credentials or commit local service-account files.

Active service modules are:

- `authService.js`
- `userService.js`
- `postService.js`
- `commentService.js`
- `likeService.js`
- `connectionService.js`
- `notificationService.js`

## Routing

- Keep routes centralized in `src/App.jsx`.
- Protect authenticated routes with `ProtectedRoute`.
- Avoid duplicate route definitions.
- Add a route only with its page, loading/error behavior, navigation entry if needed, data model, and Rules review.
- Do not add navigation links for deferred messaging, events, clubs, marketplace, or saved posts.

## Styling and UI

- Use Tailwind utility classes and the existing Campus Atelier tokens.
- Prefer `paper`, `surface`, `ink`, `ink-muted`, `border-warm`, and terracotta tokens over ad hoc color systems.
- Reuse existing spacing and typography patterns.
- Avoid arbitrary values unless the design genuinely requires them.
- Keep layouts usable on mobile, tablet, and desktop.
- Do not introduce a second design language or replace the current visual system for a small feature.

## Accessibility and interaction

- Use semantic HTML.
- Provide labels for form controls.
- Preserve visible keyboard focus states.
- Use appropriate button/link elements.
- Include useful accessible names for icon-only controls.
- Do not rely on color alone for state.
- Preserve multiline user content with appropriate whitespace handling.
- Respect `prefers-reduced-motion`.
- Provide loading, error, success, and empty states for asynchronous views where applicable.

## Error handling and forms

- Handle loading, success, and failure for asynchronous operations.
- Display useful user-facing errors without exposing secrets.
- Prevent duplicate submissions while an operation is pending.
- Normalize service errors when the existing service pattern supports it.
- Validate form input before a write, while keeping Rules as the enforcement boundary.
- Do not silently swallow errors except where the existing lifecycle deliberately treats the operation as best effort; document non-obvious cases.

## Performance

- Avoid unnecessary re-renders and duplicate listeners.
- Keep Firestore queries bounded.
- Reuse the existing two-minute user-directory cache where appropriate.
- Do not add external search, pagination infrastructure, distributed counters, or background processing without a measured product need and a reviewed design.
- Treat a new real-time listener as an ongoing read-cost decision.

## Comments and documentation

- Prefer self-explanatory code.
- Comment non-obvious business invariants, especially canonical connection IDs and atomic counter/notification behavior.
- Do not leave commented-out code or speculative TODOs.
- Update the active documentation when routes, services, collections, or security invariants change.
- Mark deferred designs as deferred; do not document them as current behavior.

## Dependencies

Do not install packages automatically. Before proposing a dependency:

- explain why it is needed;
- identify existing project capabilities that were considered;
- explain alternatives and operational cost;
- request approval before adding it.

## Verification

The current repository checks are:

- `npm run lint`;
- `npm run build`;
- manual/development-only Security Rules audits through `SecurityTestPanel`.

There is not yet a conventional automated test or Firebase Emulator Rules suite. New work should not claim that such tests exist unless they are actually added.

Before considering a code change complete:

1. verify imports and route references;
2. verify loading, error, empty, and disabled states;
3. verify the service and Rules implications;
4. run lint;
5. run the production build;
6. exercise the relevant UI path when an environment is available;
7. update documentation if the active architecture changed.

## Git safety

- Avoid destructive changes.
- Never delete files unless explicitly requested.
- Do not commit unless asked.
- Do not modify unrelated source while implementing a feature.
- Report discovered application or Rules problems separately when the requested scope is documentation-only.
