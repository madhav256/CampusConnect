/**
 * Milestone 19 — Unit 19.2: Community Membership Domain Model & Fixtures
 *
 * Deterministic community membership fixtures and identifiers for multi-tenant campus communities.
 * Enforces root collection pattern: communityMembers/{communityId}_{userId}
 */

import {
  APEX_CAMPUS_ID,
  ST_JUDE_CAMPUS_ID,
  COMMUNITY_MEMBER_ROLES,
  COMMUNITY_MEMBER_STATUSES,
} from "../constants.js";
import {
  COMMUNITY_APEX_AI,
  COMMUNITY_ST_JUDE_MED,
} from "./communities.js";

/**
 * Builds a deterministic canonical identifier for a community membership.
 * Pattern: {communityId}_{userId}
 *
 * @param {string} communityId
 * @param {string} userId
 * @returns {string} Deterministic membership ID
 */
export function getCommunityMemberId(communityId, userId) {
  return `${communityId}_${userId}`;
}

/**
 * Factory helper to construct a community member object adhering to the schema.
 *
 * @param {Object} params
 * @param {string} params.communityId
 * @param {string} params.userId
 * @param {string} params.campusId
 * @param {string} [params.role=COMMUNITY_MEMBER_ROLES.MEMBER]
 * @param {string} [params.status=COMMUNITY_MEMBER_STATUSES.ACTIVE]
 * @returns {Object} Validated community member fixture object
 */
export function buildCommunityMember({
  communityId,
  userId,
  campusId,
  role = COMMUNITY_MEMBER_ROLES.MEMBER,
  status = COMMUNITY_MEMBER_STATUSES.ACTIVE,
}) {
  return {
    id: getCommunityMemberId(communityId, userId),
    communityId,
    userId,
    campusId,
    role,
    status,
  };
}

// 1. Apex Institute of Technology - Apex AI Club Admin (Student 1 / Alex Chen)
export const COMMUNITY_MEMBER_APEX_AI_STUDENT1 = {
  id: getCommunityMemberId(COMMUNITY_APEX_AI.id, "e2e-student-a"),
  communityId: COMMUNITY_APEX_AI.id,
  userId: "e2e-student-a",
  campusId: APEX_CAMPUS_ID,
  role: COMMUNITY_MEMBER_ROLES.ADMIN,
  status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
};

// 2. Apex Institute of Technology - Apex AI Club Member (Student 2 / Jordan Taylor)
export const COMMUNITY_MEMBER_APEX_AI_STUDENT2 = {
  id: getCommunityMemberId(COMMUNITY_APEX_AI.id, "e2e-student-b"),
  communityId: COMMUNITY_APEX_AI.id,
  userId: "e2e-student-b",
  campusId: APEX_CAMPUS_ID,
  role: COMMUNITY_MEMBER_ROLES.MEMBER,
  status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
};

// 3. St. Jude University - Medical Society Admin (Student 3 / Rohan Varma)
export const COMMUNITY_MEMBER_ST_JUDE_STUDENT3 = {
  id: getCommunityMemberId(COMMUNITY_ST_JUDE_MED.id, "e2e-student-st-jude"),
  communityId: COMMUNITY_ST_JUDE_MED.id,
  userId: "e2e-student-st-jude",
  campusId: ST_JUDE_CAMPUS_ID,
  role: COMMUNITY_MEMBER_ROLES.ADMIN,
  status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
};

export const COMMUNITY_MEMBERS = {
  [COMMUNITY_MEMBER_APEX_AI_STUDENT1.id]: COMMUNITY_MEMBER_APEX_AI_STUDENT1,
  [COMMUNITY_MEMBER_APEX_AI_STUDENT2.id]: COMMUNITY_MEMBER_APEX_AI_STUDENT2,
  [COMMUNITY_MEMBER_ST_JUDE_STUDENT3.id]: COMMUNITY_MEMBER_ST_JUDE_STUDENT3,
};

export const COMMUNITY_MEMBER_LIST = [
  COMMUNITY_MEMBER_APEX_AI_STUDENT1,
  COMMUNITY_MEMBER_APEX_AI_STUDENT2,
  COMMUNITY_MEMBER_ST_JUDE_STUDENT3,
];
