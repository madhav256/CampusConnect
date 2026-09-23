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
  writeBatch,
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
  isDiscoverable: true,
  notificationPreferences: {
    connectionRequests: true,
    connectionAccepted: true,
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

export function userDocRef(uid) {
  return doc(requireDb(), "users", uid);
}

export function publicProfileDocRef(uid) {
  return doc(requireDb(), "publicProfiles", uid);
}

export function directoryIndexDocRef(uid) {
  return doc(requireDb(), "directoryIndex", uid);
}

export function normalizePublicProfile(uid, data) {
  return {
    uid,
    displayName: data?.displayName || "CampusConnect Student",
    photoURL: data?.photoURL || null,
    bio: data?.bio || "",
    department: data?.department || "Department not added",
    year: data?.year || "Academic year not added",
    skills: Array.isArray(data?.skills) ? data.skills : [],
    socialLinks: {
      github: data?.socialLinks?.github || "",
      linkedin: data?.socialLinks?.linkedin || "",
      portfolio: data?.socialLinks?.portfolio || "",
      website: data?.socialLinks?.website || "",
    },
  };
}

export function normalizeUserSettings(uid, data) {
  return {
    uid,
    email: data?.email || "",
    isDiscoverable: data?.isDiscoverable !== false,
    notificationPreferences: {
      connectionRequests:
        data?.notificationPreferences?.connectionRequests !== false,
      connectionAccepted:
        data?.notificationPreferences?.connectionAccepted !== false,
    },
    createdAt: data?.createdAt || null,
    updatedAt: data?.updatedAt || null,
  };
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
    isDiscoverable: data?.isDiscoverable !== false,
    notificationPreferences: {
      connectionRequests:
        data?.notificationPreferences?.connectionRequests !== false,
      connectionAccepted:
        data?.notificationPreferences?.connectionAccepted !== false,
    },
    createdAt: data?.createdAt || null,
    updatedAt: data?.updatedAt || null,
  };
}

export async function createUserProfile({ uid, displayName, email, photoURL, isDiscoverable = true }) {
  const uRef = userDocRef(uid);
  const pubRef = publicProfileDocRef(uid);
  const indexRef = directoryIndexDocRef(uid);

  const existingUser = await getDoc(uRef);
  if (existingUser.exists()) {
    const existingPub = await getDoc(pubRef);
    const privateSettings = normalizeUserSettings(uid, existingUser.data());
    const publicProfile = normalizePublicProfile(uid, existingPub.exists() ? existingPub.data() : null);
    return {
      uid,
      ...privateSettings,
      ...publicProfile,
    };
  }

  const firestore = requireDb();
  const batch = writeBatch(firestore);

  const privateUser = {
    uid,
    email: email || "",
    isDiscoverable: Boolean(isDiscoverable),
    notificationPreferences: {
      connectionRequests: true,
      connectionAccepted: true,
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const publicProfile = {
    uid,
    displayName: displayName || "CampusConnect Student",
    photoURL: photoURL || null,
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

  batch.set(uRef, privateUser);
  batch.set(pubRef, publicProfile);

  if (privateUser.isDiscoverable) {
    batch.set(indexRef, {
      uid,
      displayName: displayName || "CampusConnect Student",
      photoURL: photoURL || null,
      department: "",
      year: "",
      skills: [],
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();
  usersCache = null;

  return {
    uid,
    ...normalizeUserSettings(uid, privateUser),
    ...normalizePublicProfile(uid, publicProfile),
  };
}

export function subscribeToUserProfile(uid, callback, onError) {
  if (!uid) return () => {};

  let userData = null;
  let publicData = null;
  let hasUserSnap = false;
  let hasPublicSnap = false;

  const emit = () => {
    if (!hasUserSnap || !hasPublicSnap) return;
    if (!userData && !publicData) {
      callback(null);
      return;
    }

    const privateSettings = normalizeUserSettings(uid, userData);
    const publicProfile = normalizePublicProfile(uid, publicData);

    callback({
      uid,
      // Public profile fields strictly from publicProfiles
      displayName: publicProfile.displayName,
      photoURL: publicProfile.photoURL,
      bio: publicProfile.bio,
      department: publicProfile.department,
      year: publicProfile.year,
      skills: publicProfile.skills,
      socialLinks: publicProfile.socialLinks,
      // Private fields strictly from users/{uid}
      email: privateSettings.email,
      isDiscoverable: privateSettings.isDiscoverable,
      notificationPreferences: privateSettings.notificationPreferences,
      createdAt: privateSettings.createdAt,
      updatedAt: privateSettings.updatedAt,
    });
  };

  const unsubUser = onSnapshot(
    userDocRef(uid),
    (snapshot) => {
      hasUserSnap = true;
      userData = snapshot.exists() ? snapshot.data() : null;
      emit();
    },
    (err) => {
      if (onError) onError(err);
    },
  );

  const unsubPublic = onSnapshot(
    publicProfileDocRef(uid),
    (snapshot) => {
      hasPublicSnap = true;
      publicData = snapshot.exists() ? snapshot.data() : null;
      emit();
    },
    (err) => {
      if (onError) onError(err);
    },
  );

  return () => {
    unsubUser();
    unsubPublic();
  };
}

export async function updateUserProfile(uid, updates) {
  if (!uid) {
    throw new Error("User ID is required to update profile.");
  }

  const firestore = requireDb();
  const pubRef = publicProfileDocRef(uid);
  const userRef = userDocRef(uid);
  const indexRef = directoryIndexDocRef(uid);

  const [pubSnap, userSnap] = await Promise.all([
    getDoc(pubRef),
    getDoc(userRef),
  ]);

  const currentPub = pubSnap.exists() ? pubSnap.data() : {};
  const isDiscoverable = userSnap.exists() ? userSnap.data()?.isDiscoverable !== false : true;

  const newDisplayName = updates.displayName !== undefined ? updates.displayName : (currentPub.displayName || "CampusConnect Student");
  const newPhotoURL = updates.photoURL !== undefined ? updates.photoURL : (currentPub.photoURL || null);
  const newDepartment = updates.department !== undefined ? updates.department : (currentPub.department || "");
  const newYear = updates.year !== undefined ? updates.year : (currentPub.year || "");
  const newSkills = Array.isArray(updates.skills) ? updates.skills : (currentPub.skills || []);
  const newSocialLinks = {
    github: "",
    linkedin: "",
    portfolio: "",
    website: "",
    ...(currentPub.socialLinks || {}),
    ...(updates.socialLinks || {}),
  };
  const newBio = updates.bio !== undefined ? updates.bio : (currentPub.bio || "");

  const publicProfileData = {
    uid,
    displayName: newDisplayName,
    photoURL: newPhotoURL,
    bio: newBio,
    department: newDepartment,
    year: newYear,
    skills: newSkills,
    socialLinks: newSocialLinks,
  };

  if (isDiscoverable) {
    const batch = writeBatch(firestore);
    batch.set(pubRef, publicProfileData, { merge: true });
    batch.set(indexRef, {
      uid,
      displayName: newDisplayName,
      photoURL: newPhotoURL,
      department: newDepartment,
      year: newYear,
      skills: newSkills,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } else {
    await setDoc(pubRef, publicProfileData, { merge: true });
  }

  usersCache = null;
}

export async function updateUserSettings(uid, settingsUpdates) {
  if (!uid) {
    throw new Error("User ID is required to update settings.");
  }

  const firestore = requireDb();
  const userRef = userDocRef(uid);
  const indexRef = directoryIndexDocRef(uid);
  const pubRef = publicProfileDocRef(uid);

  const updates = {
    updatedAt: serverTimestamp(),
  };

  let discoverabilityChanging = false;
  let newDiscoverableValue = null;

  if (typeof settingsUpdates.isDiscoverable === "boolean") {
    discoverabilityChanging = true;
    newDiscoverableValue = settingsUpdates.isDiscoverable;
    updates.isDiscoverable = newDiscoverableValue;
  }

  if (
    settingsUpdates.notificationPreferences &&
    typeof settingsUpdates.notificationPreferences === "object"
  ) {
    const prefs = {};
    if (
      typeof settingsUpdates.notificationPreferences.connectionRequests ===
      "boolean"
    ) {
      prefs.connectionRequests =
        settingsUpdates.notificationPreferences.connectionRequests;
    }
    if (
      typeof settingsUpdates.notificationPreferences.connectionAccepted ===
      "boolean"
    ) {
      prefs.connectionAccepted =
        settingsUpdates.notificationPreferences.connectionAccepted;
    }
    if (Object.keys(prefs).length > 0) {
      updates.notificationPreferences = prefs;
    }
  }

  if (discoverabilityChanging) {
    const batch = writeBatch(firestore);
    batch.update(userRef, updates);

    if (newDiscoverableValue === true) {
      const pubSnap = await getDoc(pubRef);
      const pubData = pubSnap.exists() ? pubSnap.data() : {};

      batch.set(indexRef, {
        uid,
        displayName: pubData.displayName || "CampusConnect Student",
        photoURL: pubData.photoURL || null,
        department: pubData.department || "",
        year: pubData.year || "",
        skills: Array.isArray(pubData.skills) ? pubData.skills : [],
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.delete(indexRef);
    }

    await batch.commit();
  } else {
    await updateDoc(userRef, updates);
  }

  usersCache = null;
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
  const directoryRef = collection(firestore, "directoryIndex");
  const q = query(directoryRef, orderBy("updatedAt", "desc"), limit(limitCount));
  const snapshot = await getDocs(q);

  const users = snapshot.docs.map((docSnap) =>
    normalizePublicProfile(docSnap.id, docSnap.data())
  );

  usersCache = users;
  lastFetchTime = now;
  return users;
}

export async function fetchUserById(uid) {
  if (!uid) {
    return null;
  }

  const pubRef = publicProfileDocRef(uid);
  const snapshot = await getDoc(pubRef);

  if (!snapshot.exists()) {
    return null;
  }

  return normalizePublicProfile(uid, snapshot.data());
}

