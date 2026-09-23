import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

const isEmulator = import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true";

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyFakeKeyForLocalEmulatorTestingOnly",
  authDomain: isEmulator
    ? "demo-campusconnect-rules-test.firebaseapp.com"
    : import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: isEmulator
    ? "demo-campusconnect-rules-test"
    : import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:123456789:web:fakeAppId",
};

const requiredAuthConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.appId,
];

export const isFirebaseConfigured = requiredAuthConfig.every(Boolean);

export const firebaseApp = isFirebaseConfigured
  ? initializeApp(firebaseConfig)
  : null;

export const auth = firebaseApp ? getAuth(firebaseApp) : null;

export const db = firebaseApp ? getFirestore(firebaseApp) : null;

if (firebaseApp && isEmulator) {
  if (db && !db._emulatorConfigured) {
    try {
      connectFirestoreEmulator(db, "localhost", 8080);
      db._emulatorConfigured = true;
    } catch {
      // Ignore if already connected in hot reload
    }
  }
  if (auth && !auth._emulatorConfigured) {
    try {
      connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
      auth._emulatorConfigured = true;
    } catch {
      // Ignore if already connected in hot reload
    }
  }
}
