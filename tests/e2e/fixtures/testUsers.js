/**
 * Deterministic test user accounts for E2E testing against the Firebase Auth & Firestore emulators.
 *
 * Note: These are emulator-only test credentials used exclusively in local/CI test runs.
 * They are NOT stored in client-visible VITE_* environment variables.
 */

export const E2E_USERS = {
  studentA: {
    uid: "e2e-student-a",
    email: "e2e.student.a@campusconnect.test",
    password: "TestPassword123!",
    displayName: "Alex Chen",
    department: "Computer Science",
    year: "Senior",
    bio: "Computer Science senior focused on web architectures.",
    skills: ["React", "JavaScript", "Node.js"],
    isDiscoverable: true,
  },
  studentB: {
    uid: "e2e-student-b",
    email: "e2e.student.b@campusconnect.test",
    password: "TestPassword123!",
    displayName: "Jordan Taylor",
    department: "Design",
    year: "Junior",
    bio: "HCI and Design Systems student.",
    skills: ["UI/UX", "Figma", "Tailwind"],
    isDiscoverable: true,
  },
  studentC: {
    uid: "e2e-student-c",
    email: "e2e.student.c@campusconnect.test",
    password: "TestPassword123!",
    displayName: "Casey Morgan",
    department: "Data Science",
    year: "Sophomore",
    bio: "Machine learning and statistics explorer.",
    skills: ["Python", "Machine Learning"],
    isDiscoverable: true,
  },
};
