/**
 * Milestone 19 — Unit 19.1: Community Domain Model & Metadata
 *
 * Deterministic community fixtures and identifiers for multi-tenant campus discovery.
 */

import {
  APEX_CAMPUS_ID,
  ST_JUDE_CAMPUS_ID,
  COMMUNITY_CATEGORIES,
  COMMUNITY_STATUSES,
  COMMUNITY_VISIBILITIES,
} from "../constants.js";

export const COMMUNITY_APEX_AI = {
  id: "apex-ai-club",
  campusId: APEX_CAMPUS_ID,
  name: "Apex AI & Robotics Society",
  slug: "ai-robotics-society",
  description: "Building autonomous systems, competing in robotics tournaments, and researching modern machine learning.",
  category: COMMUNITY_CATEGORIES.TECH,
  imageURL: null,
  bannerURL: null,
  createdBy: "system",
  stats: {
    memberCount: 42,
    postCount: 15,
  },
  status: COMMUNITY_STATUSES.ACTIVE,
  visibility: COMMUNITY_VISIBILITIES.CAMPUS_PUBLIC,
};

export const COMMUNITY_APEX_DESIGN = {
  id: "apex-design-collective",
  campusId: APEX_CAMPUS_ID,
  name: "Apex Design & Creative Arts",
  slug: "design-creative-arts",
  description: "Product designers, digital artists, and creative technologists collaborating on portfolio projects.",
  category: COMMUNITY_CATEGORIES.CULTURAL,
  imageURL: null,
  bannerURL: null,
  createdBy: "system",
  stats: {
    memberCount: 24,
    postCount: 8,
  },
  status: COMMUNITY_STATUSES.ACTIVE,
  visibility: COMMUNITY_VISIBILITIES.CAMPUS_PUBLIC,
};

export const COMMUNITY_ST_JUDE_MED = {
  id: "st-jude-medical-society",
  campusId: ST_JUDE_CAMPUS_ID,
  name: "St. Jude Medical Society",
  slug: "medical-society",
  description: "Clinical research discussions, medical ethics forums, and healthcare outreach initiatives at St. Jude.",
  category: COMMUNITY_CATEGORIES.ACADEMIC,
  imageURL: null,
  bannerURL: null,
  createdBy: "system",
  stats: {
    memberCount: 31,
    postCount: 12,
  },
  status: COMMUNITY_STATUSES.ACTIVE,
  visibility: COMMUNITY_VISIBILITIES.CAMPUS_PUBLIC,
};

export const COMMUNITIES = {
  [COMMUNITY_APEX_AI.id]: COMMUNITY_APEX_AI,
  [COMMUNITY_APEX_DESIGN.id]: COMMUNITY_APEX_DESIGN,
  [COMMUNITY_ST_JUDE_MED.id]: COMMUNITY_ST_JUDE_MED,
};

export const COMMUNITY_LIST = [
  COMMUNITY_APEX_AI,
  COMMUNITY_APEX_DESIGN,
  COMMUNITY_ST_JUDE_MED,
];
