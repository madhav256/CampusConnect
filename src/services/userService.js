import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
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

export function normalizeProfile(uid, data) {
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

let usersCache = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

export async function fetchAllUsers(limitCount = 100) {
  const now = Date.now();
  if (usersCache && now - lastFetchTime < CACHE_TTL_MS) {
    return usersCache;
  }

  const firestore = requireDb();
  const usersRef = collection(firestore, "users");
  const q = query(usersRef, orderBy("updatedAt", "desc"), limit(limitCount));
  const snapshot = await getDocs(q);

  const users = snapshot.docs.map((docSnap) =>
    normalizeProfile(docSnap.id, docSnap.data())
  );

  usersCache = users;
  lastFetchTime = now;
  return users;
}

export async function fetchUserById(uid) {
  if (!uid) {
    return null;
  }

  const profileRef = userDocRef(uid);
  const snapshot = await getDoc(profileRef);

  if (!snapshot.exists()) {
    return null;
  }

  return normalizeProfile(uid, snapshot.data());
}

