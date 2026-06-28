import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "../firebase/config";

const authErrorMessages = {
  "auth/email-already-in-use": "An account already exists with this email.",
  "auth/invalid-credential": "The email or password is incorrect.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/missing-password": "Enter your password.",
  "auth/too-many-requests": "Too many attempts. Please try again later.",
  "auth/user-not-found": "No account exists with this email.",
  "auth/weak-password": "Use a password with at least 6 characters.",
  "auth/wrong-password": "The email or password is incorrect.",
};

function requireAuth() {
  if (!isFirebaseConfigured || !auth) {
    throw new Error(
      "Firebase is not configured. Add your Vite Firebase environment variables and restart the dev server.",
    );
  }

  return auth;
}

export function getAuthErrorMessage(error) {
  return authErrorMessages[error?.code] || error?.message || "Something went wrong. Please try again.";
}

export function toAuthUser(firebaseUser) {
  if (!firebaseUser) {
    return null;
  }

  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    name: firebaseUser.displayName || firebaseUser.email,
    photoURL: firebaseUser.photoURL,
    emailVerified: firebaseUser.emailVerified,
  };
}

export function configureAuthPersistence() {
  return setPersistence(requireAuth(), browserLocalPersistence);
}

export function subscribeToAuthChanges(callback) {
  return onAuthStateChanged(requireAuth(), callback);
}

export async function signUpWithEmail({ name, email, password }) {
  const credential = await createUserWithEmailAndPassword(
    requireAuth(),
    email,
    password,
  );

  if (name) {
    await updateProfile(credential.user, { displayName: name });
  }

  return toAuthUser(credential.user);
}

export async function loginWithEmail({ email, password }) {
  const credential = await signInWithEmailAndPassword(
    requireAuth(),
    email,
    password,
  );

  return toAuthUser(credential.user);
}

export function logoutUser() {
  return signOut(requireAuth());
}

export function sendPasswordReset(email) {
  return sendPasswordResetEmail(requireAuth(), email);
}
