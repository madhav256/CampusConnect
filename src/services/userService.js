import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/config";

const defaultProfile = {
  photoURL: null,
  bio: "",
  department: "",
  year: "",
  skills: [],
  socialLinks: {
    github: "",
    linkedin: "",
    portfolio: "",
    website: "",
  },
};

function requireDb() {
  if (!isFirebaseConfigured || !db) {
    throw new Error(
      "Firestore is not configured. Add your Vite Firebase environment variables and restart the dev server.",
    );
  }

  return db;
}

function userDocRef(uid) {
  return doc(requireDb(), "users", uid);
}

function normalizeProfile(uid, data) {
  return {
    uid,
    displayName: data?.displayName || "CampusConnect Student",
    email: data?.email || "",
    photoURL: data?.photoURL || null,
    bio: data?.bio || "",
    department: data?.department || "Department not added",
    year: data?.year || "Academic year not added",
    skills: Array.isArray(data?.skills) ? data.skills : [],
    socialLinks: {
      ...defaultProfile.socialLinks,
      ...(data?.socialLinks || {}),
    },
    createdAt: data?.createdAt || null,
    updatedAt: data?.updatedAt || null,
  };
}

export async function createUserProfile({ uid, displayName, email, photoURL }) {
  const profileRef = userDocRef(uid);
  const existingProfile = await getDoc(profileRef);

  if (existingProfile.exists()) {
    return normalizeProfile(uid, existingProfile.data());
  }

  const profile = {
    uid,
    displayName: displayName || "CampusConnect Student",
    email,
    ...defaultProfile,
    photoURL: photoURL || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(profileRef, profile);

  return normalizeProfile(uid, profile);
}

export function subscribeToUserProfile(uid, callback, onError) {
  return onSnapshot(
    userDocRef(uid),
    (snapshot) => {
      callback(snapshot.exists() ? normalizeProfile(uid, snapshot.data()) : null);
    },
    onError,
  );
}

export async function updateUserProfile(uid, updates) {
  const profileUpdates = {
    displayName: updates.displayName,
    bio: updates.bio,
    department: updates.department,
    year: updates.year,
    skills: updates.skills,
    socialLinks: {
      ...defaultProfile.socialLinks,
      ...(updates.socialLinks || {}),
    },
    updatedAt: serverTimestamp(),
  };

  await updateDoc(userDocRef(uid), profileUpdates);
}
