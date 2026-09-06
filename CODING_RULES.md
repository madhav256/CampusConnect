# CODING_RULES.md

# CampusConnect Coding Rules

These rules apply to every task performed in this repository.

The objective is to produce production-quality, maintainable, scalable, and readable software.

---

# General Principles

- Prioritize correctness over speed.
- Prioritize maintainability over cleverness.
- Always write code as if another developer will maintain it.
- Keep solutions simple.
- Avoid unnecessary complexity.
- Never introduce technical debt unless explicitly requested.

---

# Before Making Changes

Before editing any files:

1. Read all relevant files.
2. Understand the current implementation.
3. Explain the implementation plan.
4. Identify the files that will be modified.
5. Preserve existing functionality unless the task requires changes.

Never begin making random edits without understanding the codebase.

---

# Scope

Only modify files directly related to the requested feature or bug.

Never refactor unrelated code during feature development.

Never change project architecture unless explicitly requested.

---

# React Guidelines

Always:

- Use functional components.
- Use React hooks.
- Keep components focused on one responsibility.
- Prefer composition over inheritance.
- Avoid deeply nested JSX.
- Keep render functions simple.

Avoid:

- Large monolithic components.
- Duplicate JSX.
- Inline business logic.
- Anonymous functions inside large JSX trees when avoidable.

---

# Component Design

Each component should have a single responsibility.

Prefer reusable components over duplicated UI.

Extract repeated UI into reusable components.

Avoid components larger than approximately 250 lines unless clearly justified.

---

# State Management

Keep state as local as possible.

Do not create global state unnecessarily.

Lift state only when required.

Avoid prop drilling when Context is more appropriate.

---

# Folder Structure

Respect the existing architecture.

Prefer:

components/
pages/
layouts/
contexts/
hooks/
services/
utils/
firebase/
assets/

Do not create unnecessary folders.

---

# Firebase

Separate Firebase logic from UI whenever practical.

Prefer:

services/authService.js

services/postService.js

services/userService.js

Avoid placing Firestore queries directly inside UI components unless trivial.

Always handle:

- loading
- success
- failure

Never expose secrets.

---

# Routing

Maintain clean routing.

Protect authenticated routes.

Avoid duplicate route definitions.

Keep routing configuration organized.

---

# Tailwind CSS

Use Tailwind utility classes.

Maintain consistent spacing.

Maintain consistent typography.

Avoid inline styles.

Avoid arbitrary values unless necessary.

Reuse utility patterns whenever possible.

---

# UI Standards

The UI should be:

- clean
- modern
- minimal
- responsive
- accessible

Every page should support:

- desktop
- tablet
- mobile

Avoid horizontal scrolling.

---

# Accessibility

Whenever applicable:

- use semantic HTML
- use proper labels
- maintain keyboard accessibility
- maintain focus visibility
- include alt text for images

---

# Error Handling

Every asynchronous operation should handle:

- loading
- success
- failure

Display meaningful error messages.

Never leave unhandled Promise rejections.

---

# Forms

Validate all user input.

Provide clear validation messages.

Prevent duplicate submissions.

Disable submit buttons during loading.

---

# Performance

Prefer efficient rendering.

Avoid unnecessary state.

Avoid unnecessary re-renders.

Lazy load pages when appropriate.

Optimize Firestore reads.

Avoid duplicate network requests.

---

# Code Style

Use descriptive names.

Prefer clarity over abbreviations.

Keep functions focused.

Avoid deeply nested conditionals.

Extract reusable logic into hooks or utilities.

---

# Comments

Write self-explanatory code.

Only add comments when explaining non-obvious business logic.

Never leave commented-out code.

Never leave TODO comments unless explicitly requested.

---

# Dependencies

Do not install new packages automatically.

Before adding a dependency:

- explain why it is needed
- explain available alternatives
- request approval

Prefer existing project dependencies whenever possible.

---

# Refactoring

Refactor only when it improves:

- readability
- maintainability
- performance
- reusability

Avoid unnecessary rewrites.

Preserve existing behavior.

---

# Git Safety

Avoid destructive changes.

Never delete files unless explicitly instructed.

Never overwrite user code without explanation.

When unsure:

ask instead of guessing.

---

# Feature Development Workflow

For every feature:

1. Explain the implementation.
2. List files to change.
3. Implement incrementally.
4. Verify imports.
5. Check for build errors.
6. Check for lint errors if applicable.
7. Explain what changed.

---

# Bug Fix Workflow

Identify:

- root cause
- affected files
- safest fix

Do not patch symptoms.

Fix the underlying issue whenever possible.

---

# Testing

Before considering a task complete:

- verify imports
- verify routing
- verify component rendering
- verify Firebase integration
- verify responsive layout

---

# Output Quality

All generated code should be production-ready.

Do not generate:

- placeholder implementations
- fake APIs
- unfinished features
- mock data unless requested

Deliver complete, working implementations whenever possible.

---

# Communication

When responding:

- be concise
- explain important decisions
- mention tradeoffs
- identify potential risks

If uncertain:

state the uncertainty instead of making assumptions.

---

# Definition of Done

A task is complete only if:

- the feature works
- existing functionality is preserved
- code is clean
- code is reusable
- no obvious bugs remain
- imports are correct
- routing works
- loading states exist
- error states exist
- responsive behavior is verified
- implementation matches the requested requirements

---

# Agent Efficiency & Tool Usage

- Prefer terminal/CLI commands, scripts, APIs, and direct file edits over browser UI interaction whenever possible.
- For Firebase operations, prefer Firebase CLI over the Firebase Console.
- Never manually type/paste large code or configuration into a web editor when an equivalent CLI/API/file operation exists.
- For deployment, use the narrowest possible command (firebase deploy --only firestore:rules, firebase deploy --only hosting, etc.) rather than full deployment.
- Before using browser automation, check whether the task can be completed deterministically through the terminal or a local file.
- If a CLI/API operation fails, report the error rather than spending extended time on browser automation.
- Do not repeatedly retry rate-limited tools.
- Optimize for minimal tool calls and preservation of AI quota.
