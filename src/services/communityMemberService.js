/**
 * Milestone 19 — Unit 19.4: Community Client Services & Hook Layer
 *
 * Authoritative client-side community membership service.
 * Handles membership retrieval, member list queries, and supported membership actions
 * (joining as a member and leaving) strictly adhering to Firestore Security Rules.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/config";
import {
  COMMUNITY_MEMBER_ROLES,
  COMMUNITY_MEMBER_STATUSES,
} from "../constants.js";
import { getCommunityMemberId } from "../data/communityMembers.js";

function requireDb() {
  if (!isFirebaseConfigured || !db) {
    throw new Error(
      "Firestore is not configured. Add your Vite Firebase environment variables and restart the dev server."
    );
  }
  return db;
}

export function communityMemberDocRef(membershipId) {
  if (!membershipId || typeof membershipId !== "string") {
    throw new Error("Membership ID is required to resolve document reference.");
  }
  return doc(requireDb(), "communityMembers", membershipId);
}

export function communityMembersCollectionRef() {
  return collection(requireDb(), "communityMembers");
}

/**
 * Normalizes a raw Firestore community membership document into the application data contract.
 *
 * @param {string} id
 * @param {object|null} data
 * @returns {object|null}
 */
export function normalizeCommunityMember(id, data) {
  if (!data) return null;

  return {
    id: id || data.id,
    communityId: data.communityId || "",
    userId: data.userId || "",
    campusId: data.campusId || "",
    role: data.role || COMMUNITY_MEMBER_ROLES.MEMBER,
    status: data.status || COMMUNITY_MEMBER_STATUSES.ACTIVE,
    joinedAt: data.joinedAt || null,
    updatedAt: data.updatedAt || null,
  };
}

/**
 * Fetches the membership record for a specific user within a community.
 *
 * @param {string} communityId
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function getCommunityMembership(communityId, userId) {
  if (!communityId || !userId || typeof communityId !== "string" || typeof userId !== "string") {
    return null;
  }

  const membershipId = getCommunityMemberId(communityId, userId);
  const mRef = communityMemberDocRef(membershipId);
  const snap = await getDoc(mRef);

  if (!snap.exists()) {
    return null;
  }

  return normalizeCommunityMember(snap.id, snap.data());
}

/**
 * Subscribes in real-time to a user's membership status within a community.
 *
 * @param {string} communityId
 * @param {string} userId
 * @param {function} callback
 * @param {function} [onError]
 * @returns {function} Unsubscribe function
 */
export function subscribeToCommunityMembership(communityId, userId, callback, onError) {
  if (!communityId || !userId || typeof communityId !== "string" || typeof userId !== "string") {
    if (callback) callback(null);
    return () => {};
  }

  try {
    const membershipId = getCommunityMemberId(communityId, userId);
    const mRef = communityMemberDocRef(membershipId);

    return onSnapshot(
      mRef,
      (snap) => {
        if (snap.exists()) {
          callback(normalizeCommunityMember(snap.id, snap.data()));
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
 * Fetches all members of a community.
 *
 * @param {string} communityId
 * @returns {Promise<Array<object>>}
 */
export async function getCommunityMembers(communityId) {
  if (!communityId || typeof communityId !== "string") {
    return [];
  }

  try {
    const colRef = communityMembersCollectionRef();
    const q = query(colRef, where("communityId", "==", communityId));
    const snap = await getDocs(q);

    if (snap.empty) {
      return [];
    }

    return snap.docs.map((d) => normalizeCommunityMember(d.id, d.data()));
  } catch {
    return [];
  }
}

/**
 * Subscribes in real-time to the member roster of a community.
 *
 * @param {string} communityId
 * @param {function} callback
 * @param {function} [onError]
 * @returns {function} Unsubscribe function
 */
export function subscribeToCommunityMembers(communityId, callback, onError) {
  if (!communityId || typeof communityId !== "string") {
    if (callback) callback([]);
    return () => {};
  }

  try {
    const colRef = communityMembersCollectionRef();
    const q = query(colRef, where("communityId", "==", communityId));

    return onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => normalizeCommunityMember(d.id, d.data()));
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
 * Creates an active membership record for the authenticated user in a community.
 * Adheres strictly to the schema constraints in `isValidCommunityMemberCreate()`.
 *
 * @param {string} communityId
 * @param {string} userId
 * @param {string} campusId
 * @returns {Promise<object>} Created membership object
 */
export async function joinCommunity(communityId, userId, campusId) {
  if (!communityId || !userId || !campusId) {
    throw new Error("communityId, userId, and campusId are required to join a community.");
  }

  const membershipId = getCommunityMemberId(communityId, userId);
  const mRef = communityMemberDocRef(membershipId);

  const newMembership = {
    id: membershipId,
    communityId,
    userId,
    campusId,
    role: COMMUNITY_MEMBER_ROLES.MEMBER,
    status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
    joinedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(mRef, newMembership);
  return newMembership;
}

/**
 * Deletes the authenticated user's membership record, effectively leaving the community.
 * Adheres strictly to `allow delete` rules (user is owner of membership).
 *
 * @param {string} communityId
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function leaveCommunity(communityId, userId) {
  if (!communityId || !userId) {
    throw new Error("communityId and userId are required to leave a community.");
  }

  const membershipId = getCommunityMemberId(communityId, userId);
  const mRef = communityMemberDocRef(membershipId);

  await deleteDoc(mRef);
}

/**
 * Updates the role of a community member.
 * Backed by isValidCommunityMemberUpdate in Firestore security rules.
 *
 * @param {string} communityId
 * @param {string} userId
 * @param {string} newRole
 * @returns {Promise<void>}
 */
export async function updateCommunityMemberRole(communityId, userId, newRole) {
  if (!communityId || !userId || !newRole) {
    throw new Error("communityId, userId, and newRole are required to update member role.");
  }

  const membershipId = getCommunityMemberId(communityId, userId);
  const mRef = communityMemberDocRef(membershipId);

  await updateDoc(mRef, {
    role: newRole,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Updates the status of a community member (e.g., 'active', 'removed').
 * Backed by isValidCommunityMemberUpdate in Firestore security rules.
 *
 * @param {string} communityId
 * @param {string} userId
 * @param {string} newStatus
 * @returns {Promise<void>}
 */
export async function updateCommunityMemberStatus(communityId, userId, newStatus) {
  if (!communityId || !userId || !newStatus) {
    throw new Error("communityId, userId, and newStatus are required to update member status.");
  }

  const membershipId = getCommunityMemberId(communityId, userId);
  const mRef = communityMemberDocRef(membershipId);

  await updateDoc(mRef, {
    status: newStatus,
    updatedAt: serverTimestamp(),
  });
}

export const updateMemberRole = updateCommunityMemberRole;
export const updateMemberStatus = updateCommunityMemberStatus;
