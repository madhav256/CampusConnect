import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  mockAuth: {
    currentUser: null,
  },
  browserLocalPersistence: { type: "LOCAL" },
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  setPersistence: vi.fn(),
  onAuthStateChanged: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock("../../src/firebase/config", () => ({
  auth: mocks.mockAuth,
  isFirebaseConfigured: true,
}));

vi.mock("firebase/auth", () => ({
  browserLocalPersistence: mocks.browserLocalPersistence,
  createUserWithEmailAndPassword: mocks.createUserWithEmailAndPassword,
  signInWithEmailAndPassword: mocks.signInWithEmailAndPassword,
  signOut: mocks.signOut,
  sendPasswordResetEmail: mocks.sendPasswordResetEmail,
  setPersistence: mocks.setPersistence,
  onAuthStateChanged: mocks.onAuthStateChanged,
  updateProfile: mocks.updateProfile,
}));

import {
  toAuthUser,
  getAuthErrorMessage,
  configureAuthPersistence,
  subscribeToAuthChanges,
  signUpWithEmail,
  loginWithEmail,
  logoutUser,
  sendPasswordReset,
  updateCurrentUserDisplayName,
} from "../../src/services/authService.js";

describe("authService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockAuth.currentUser = null;
  });

  describe("toAuthUser", () => {
    it("returns null when firebaseUser is null or undefined", () => {
      expect(toAuthUser(null)).toBeNull();
      expect(toAuthUser(undefined)).toBeNull();
    });

    it("normalizes firebaseUser using displayName when present", () => {
      const fbUser = {
        uid: "uid-123",
        email: "alice@example.test",
        displayName: "Alice Student",
        photoURL: "https://avatar.test/alice.jpg",
        emailVerified: true,
      };

      expect(toAuthUser(fbUser)).toEqual({
        uid: "uid-123",
        email: "alice@example.test",
        name: "Alice Student",
        photoURL: "https://avatar.test/alice.jpg",
        emailVerified: true,
      });
    });

    it("falls back to email for name when displayName is absent or empty", () => {
      const fbUser = {
        uid: "uid-456",
        email: "bob@example.test",
        displayName: null,
        photoURL: null,
        emailVerified: false,
      };

      expect(toAuthUser(fbUser)).toEqual({
        uid: "uid-456",
        email: "bob@example.test",
        name: "bob@example.test",
        photoURL: null,
        emailVerified: false,
      });
    });
  });

  describe("getAuthErrorMessage", () => {
    it("maps known Firebase Auth error codes accurately", () => {
      expect(getAuthErrorMessage({ code: "auth/email-already-in-use" })).toBe(
        "An account already exists with this email."
      );
      expect(getAuthErrorMessage({ code: "auth/invalid-credential" })).toBe(
        "The email or password is incorrect."
      );
      expect(getAuthErrorMessage({ code: "auth/invalid-email" })).toBe(
        "Enter a valid email address."
      );
      expect(getAuthErrorMessage({ code: "auth/missing-password" })).toBe(
        "Enter your password."
      );
      expect(getAuthErrorMessage({ code: "auth/too-many-requests" })).toBe(
        "Too many attempts. Please try again later."
      );
      expect(getAuthErrorMessage({ code: "auth/user-not-found" })).toBe(
        "No account exists with this email."
      );
      expect(getAuthErrorMessage({ code: "auth/weak-password" })).toBe(
        "Use a password with at least 6 characters."
      );
      expect(getAuthErrorMessage({ code: "auth/wrong-password" })).toBe(
        "The email or password is incorrect."
      );
    });

    it("falls back to error.message for unmapped error codes", () => {
      expect(getAuthErrorMessage({ code: "auth/custom-error", message: "Custom message" })).toBe(
        "Custom message"
      );
    });

    it("falls back to generic message when error has no code or message", () => {
      expect(getAuthErrorMessage(null)).toBe("Something went wrong. Please try again.");
      expect(getAuthErrorMessage({})).toBe("Something went wrong. Please try again.");
    });
  });

  describe("configureAuthPersistence", () => {
    it("configures persistence with browserLocalPersistence", async () => {
      mocks.setPersistence.mockResolvedValue();

      await configureAuthPersistence();

      expect(mocks.setPersistence).toHaveBeenCalledWith(
        mocks.mockAuth,
        mocks.browserLocalPersistence
      );
    });
  });

  describe("subscribeToAuthChanges", () => {
    it("delegates to onAuthStateChanged", () => {
      const cb = vi.fn();
      subscribeToAuthChanges(cb);

      expect(mocks.onAuthStateChanged).toHaveBeenCalledWith(mocks.mockAuth, cb);
    });
  });

  describe("signUpWithEmail", () => {
    it("creates account, updates display name when provided, and returns normalized user", async () => {
      const mockFbUser = {
        uid: "new-user-uid",
        email: "student@test.edu",
        displayName: "New Student",
        photoURL: null,
        emailVerified: false,
      };

      mocks.createUserWithEmailAndPassword.mockResolvedValue({
        user: mockFbUser,
      });
      mocks.updateProfile.mockResolvedValue();

      const user = await signUpWithEmail({
        name: "New Student",
        email: "student@test.edu",
        password: "password123",
      });

      expect(mocks.createUserWithEmailAndPassword).toHaveBeenCalledWith(
        mocks.mockAuth,
        "student@test.edu",
        "password123"
      );
      expect(mocks.updateProfile).toHaveBeenCalledWith(mockFbUser, {
        displayName: "New Student",
      });
      expect(user).toEqual({
        uid: "new-user-uid",
        email: "student@test.edu",
        name: "New Student",
        photoURL: null,
        emailVerified: false,
      });
    });

    it("creates account without updating profile when name is omitted", async () => {
      const mockFbUser = {
        uid: "user-anon",
        email: "anon@test.edu",
        displayName: null,
        photoURL: null,
        emailVerified: false,
      };

      mocks.createUserWithEmailAndPassword.mockResolvedValue({
        user: mockFbUser,
      });

      const user = await signUpWithEmail({
        email: "anon@test.edu",
        password: "password123",
      });

      expect(mocks.updateProfile).not.toHaveBeenCalled();
      expect(user.name).toBe("anon@test.edu");
    });
  });

  describe("loginWithEmail", () => {
    it("signs in with credentials and returns normalized user", async () => {
      const mockFbUser = {
        uid: "login-uid",
        email: "login@test.edu",
        displayName: "Login User",
        photoURL: null,
        emailVerified: true,
      };

      mocks.signInWithEmailAndPassword.mockResolvedValue({
        user: mockFbUser,
      });

      const user = await loginWithEmail({
        email: "login@test.edu",
        password: "secretpassword",
      });

      expect(mocks.signInWithEmailAndPassword).toHaveBeenCalledWith(
        mocks.mockAuth,
        "login@test.edu",
        "secretpassword"
      );
      expect(user.uid).toBe("login-uid");
    });
  });

  describe("logoutUser", () => {
    it("calls signOut on auth instance", async () => {
      mocks.signOut.mockResolvedValue();

      await logoutUser();

      expect(mocks.signOut).toHaveBeenCalledWith(mocks.mockAuth);
    });
  });

  describe("sendPasswordReset", () => {
    it("calls sendPasswordResetEmail with email", async () => {
      mocks.sendPasswordResetEmail.mockResolvedValue();

      await sendPasswordReset("forgot@test.edu");

      expect(mocks.sendPasswordResetEmail).toHaveBeenCalledWith(
        mocks.mockAuth,
        "forgot@test.edu"
      );
    });
  });

  describe("updateCurrentUserDisplayName", () => {
    it("throws if no user is currently authenticated", async () => {
      mocks.mockAuth.currentUser = null;

      await expect(
        updateCurrentUserDisplayName("Updated Name")
      ).rejects.toThrow("You must be logged in to update your profile.");

      expect(mocks.updateProfile).not.toHaveBeenCalled();
    });

    it("calls updateProfile on currentUser when authenticated", async () => {
      const mockCurrentUser = { uid: "curr-uid", displayName: "Old Name" };
      mocks.mockAuth.currentUser = mockCurrentUser;
      mocks.updateProfile.mockResolvedValue();

      await updateCurrentUserDisplayName("New Name");

      expect(mocks.updateProfile).toHaveBeenCalledWith(mockCurrentUser, {
        displayName: "New Name",
      });
    });
  });
});
