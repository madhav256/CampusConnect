# CampusConnect Architecture

## Overview

CampusConnect is a modern social networking platform exclusively for college students.

The application is built using React, Vite, Tailwind CSS and Firebase.

The architecture should prioritize:

- scalability
- maintainability
- reusable components
- responsive design
- clean separation of concerns

---

# Tech Stack

Frontend

- React
- Vite
- React Router DOM
- Tailwind CSS

Backend

- Firebase Authentication
- Cloud Firestore
- Firebase Storage

---

# Folder Structure

src/

components/
pages/
layouts/
contexts/
hooks/
services/
utils/
assets/
firebase/
routes/

---

# Responsibilities

## Components

Reusable UI.

Examples:

- Navbar
- Sidebar
- Button
- Modal
- Avatar
- PostCard
- Comment
- Input
- Loader

---

## Pages

Entire screens.

Examples:

- Login
- Register
- Feed
- Profile
- Search
- Messages
- Notifications
- Settings

---

## Services

Business logic.

Examples:

- authService
- firestoreService
- storageService

Components should never contain Firebase queries directly unless unavoidable.

---

## Contexts

Global application state.

Examples

- AuthContext
- ThemeContext

---

## Hooks

Reusable custom hooks.

Examples

- useAuth
- useFirestore
- usePosts

---

## Utilities

Helper functions.

Examples

- date formatting
- validation
- constants

---

# Coding Principles

- Small components
- Reusable code
- Avoid duplication
- Single responsibility
- Clean naming
- Consistent formatting

---

# Performance

- Lazy load pages
- Memoize expensive computations
- Optimize Firestore reads
- Avoid unnecessary re-renders

---

# Error Handling

Always handle

- loading
- success
- failure
- empty state

No uncaught async errors.

---

# Security

Use Firebase Security Rules.

Never expose secrets.

Validate user input.

Never trust client-side validation alone.
