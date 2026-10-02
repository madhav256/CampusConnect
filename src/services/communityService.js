/**
 * Milestone 19 — Unit 19.4: Community Client Services & Hook Layer
 *
 * Authoritative client-side community service.
 * Provides access to community documents and metadata.
 * Creation/updates are restricted to system/admin pipelines per security rules.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/config";
import { COMMUNITIES, COMMUNITY_LIST } from "../data/communities.js";

function requireDb() {
  if (!isFirebaseConfigured || !db) {
    throw new Error(
      "Firestore is not configured. Add your Vite Firebase environment variables and restart the dev server."
    );
  }
  return db;
}

export function communityDocRef(communityId) {
  if (!communityId || typeof communityId !== "string") {
    throw new Error("Community ID is required to resolve document reference.");
  }
  return doc(requireDb(), "communities", communityId);
}

export function communitiesCollectionRef() {
  return collection(requireDb(), "communities");
}

/**
 * Normalizes a raw Firestore community document into the application data contract.
 *
 * @param {string} communityId
 * @param {object|null} data
 * @returns {object|null}
 */
export function normalizeCommunity(communityId, data) {
  if (!data) return null;

  return {
    id: communityId,
    campusId: data.campusId || "",
    name: data.name || "Untitled Community",
    slug: data.slug || communityId,
    description: data.description || "",
    category: data.category || "general",
    imageURL: data.imageURL || null,
    bannerURL: data.bannerURL || null,
    createdBy: data.createdBy || "system",
    stats: {
      memberCount: Number(data.stats?.memberCount) || 0,
      postCount: Number(data.stats?.postCount) || 0,
    },
    status: data.status || "active",
    visibility: data.visibility || "campus_public",
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

/**
 * Fetches an individual community by its document ID.
 * Returns null if the community is not found.
 *
 * @param {string} communityId
 * @returns {Promise<object|null>}
 */
export async function getCommunityById(communityId) {
  if (!communityId || typeof communityId !== "string") {
    return null;
  }

  try {
    const cRef = communityDocRef(communityId);
    const snap = await getDoc(cRef);

    if (!snap.exists()) {
      if (COMMUNITIES[communityId]) {
        return normalizeCommunity(communityId, COMMUNITIES[communityId]);
      }
      return null;
    }

    return normalizeCommunity(snap.id, snap.data());
  } catch (err) {
    if (COMMUNITIES[communityId]) {
      return normalizeCommunity(communityId, COMMUNITIES[communityId]);
    }
    throw err;
  }
}

/**
 * Fetches all communities scoped to a specific campus tenant.
 *
 * @param {string} campusId
 * @returns {Promise<Array<object>>}
 */
export async function getCommunitiesByCampus(campusId) {
  if (!campusId || typeof campusId !== "string") {
    return [];
  }

  try {
    const colRef = communitiesCollectionRef();
    const q = query(colRef, where("campusId", "==", campusId));
    const snap = await getDocs(q);

    if (snap.empty) {
      const fallback = COMMUNITY_LIST.filter((c) => c.campusId === campusId);
      return fallback.map((c) => normalizeCommunity(c.id, c));
    }

    const items = snap.docs.map((d) => normalizeCommunity(d.id, d.data()));
    return items.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    const fallback = COMMUNITY_LIST.filter((c) => c.campusId === campusId);
    return fallback.map((c) => normalizeCommunity(c.id, c));
  }
}

/**
 * Subscribes in real-time to communities for a specific campus tenant.
 *
 * @param {string} campusId
 * @param {function} callback
 * @param {function} [onError]
 * @returns {function} Unsubscribe function
 */
export function subscribeToCommunitiesByCampus(campusId, callback, onError) {
  if (!campusId || typeof campusId !== "string") {
    if (callback) callback([]);
    return () => {};
  }

  try {
    const colRef = communitiesCollectionRef();
    const q = query(colRef, where("campusId", "==", campusId));

    return onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => normalizeCommunity(d.id, d.data()));
        items.sort((a, b) => a.name.localeCompare(b.name));
        callback(items);
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
 * Subscribes in real-time to a single community document.
 *
 * @param {string} communityId
 * @param {function} callback
 * @param {function} [onError]
 * @returns {function} Unsubscribe function
 */
export function subscribeToCommunity(communityId, callback, onError) {
  if (!communityId || typeof communityId !== "string") {
    if (callback) callback(null);
    return () => {};
  }

  try {
    const cRef = communityDocRef(communityId);
    return onSnapshot(
      cRef,
      (snap) => {
        if (snap.exists()) {
          callback(normalizeCommunity(snap.id, snap.data()));
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
 * Retrieves the statistical counters for a community.
 *
 * @param {string} communityId
 * @returns {Promise<{ memberCount: number, postCount: number }>}
 */
export async function getCommunityStats(communityId) {
  const comm = await getCommunityById(communityId);
  return (
    comm?.stats || {
      memberCount: 0,
      postCount: 0,
    }
  );
}
