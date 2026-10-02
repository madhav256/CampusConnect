/**
 * Milestone 18 — Unit 18.3: Client Services & Campus Context
 *
 * Authoritative client-side campus service.
 * Provides read-only access to campus documents and metadata.
 * Client-side creation/update is strictly disallowed by security rules and architectural policy.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/config";
import { CAMPUS_LIST, CAMPUSES } from "../data/campuses";

function requireDb() {
  if (!isFirebaseConfigured || !db) {
    throw new Error(
      "Firestore is not configured. Add your Vite Firebase environment variables and restart the dev server."
    );
  }
  return db;
}

export function campusDocRef(campusId) {
  if (!campusId) {
    throw new Error("Campus ID is required to resolve document reference.");
  }
  return doc(requireDb(), "campuses", campusId);
}

export function campusesCollectionRef() {
  return collection(requireDb(), "campuses");
}

/**
 * Normalizes a raw Firestore campus document into the application data contract.
 *
 * @param {string} campusId
 * @param {object|null} data
 * @returns {object|null}
 */
export function normalizeCampus(campusId, data) {
  if (!data) return null;

  return {
    id: campusId,
    name: data.name || "Unknown Campus",
    shortName: data.shortName || data.name || "",
    slug: data.slug || campusId,
    domain: data.domain || "",
    location: {
      city: data.location?.city || "",
      state: data.location?.state || "",
      country: data.location?.country || "India",
    },
    status: data.status || "active",
    isActive: data.status ? data.status === "active" : data.isActive !== false,
    branding: {
      logoURL: data.branding?.logoURL || null,
      primaryColor: data.branding?.primaryColor || "#c2410c",
    },
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

// In-memory cache for campus metadata
const campusCache = new Map();

/**
 * Fetches a single campus by ID.
 * Returns null if the campus does not exist.
 *
 * @param {string} campusId
 * @returns {Promise<object|null>}
 */
export async function fetchCampusById(campusId) {
  if (!campusId || typeof campusId !== "string") {
    return null;
  }

  if (campusCache.has(campusId)) {
    return campusCache.get(campusId);
  }

  try {
    const cRef = campusDocRef(campusId);
    const snap = await getDoc(cRef);

    if (!snap.exists()) {
      // Check static registry fallback before declaring not found
      if (CAMPUSES[campusId]) {
        const fallback = normalizeCampus(campusId, CAMPUSES[campusId]);
        campusCache.set(campusId, fallback);
        return fallback;
      }
      return null;
    }

    const normalized = normalizeCampus(snap.id, snap.data());
    campusCache.set(campusId, normalized);
    return normalized;
  } catch (err) {
    if (CAMPUSES[campusId]) {
      return normalizeCampus(campusId, CAMPUSES[campusId]);
    }
    throw err;
  }
}

/**
 * Fetches all available campuses.
 *
 * @returns {Promise<Array<object>>}
 */
export async function fetchAllCampuses() {
  try {
    const colRef = campusesCollectionRef();
    const snap = await getDocs(colRef);

    if (snap.empty) {
      return CAMPUS_LIST.map((c) => normalizeCampus(c.id, c));
    }

    return snap.docs.map((d) => normalizeCampus(d.id, d.data()));
  } catch {
    return CAMPUS_LIST.map((c) => normalizeCampus(c.id, c));
  }
}

/**
 * Subscribes to realtime updates of a specific campus document.
 *
 * @param {string} campusId
 * @param {function} callback
 * @param {function} [onError]
 * @returns {function} Unsubscribe function
 */
export function subscribeToCampus(campusId, callback, onError) {
  if (!campusId) {
    if (callback) callback(null);
    return () => {};
  }

  try {
    return onSnapshot(
      campusDocRef(campusId),
      (snap) => {
        if (snap.exists()) {
          const normalized = normalizeCampus(snap.id, snap.data());
          campusCache.set(campusId, normalized);
          callback(normalized);
        } else {
          callback(null);
        }
      },
      (err) => {
        if (onError) onError(err);
      }
    );
  } catch (err) {
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Clears the in-memory campus cache (useful in tests).
 */
export function clearCampusCache() {
  campusCache.clear();
}
