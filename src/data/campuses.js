/**
 * Milestone 18 — Unit 18.1: Campus Domain Model & Metadata
 *
 * Authoritative campus fixtures and deterministic identifiers for multi-tenancy.
 */

import { APEX_CAMPUS_ID, ST_JUDE_CAMPUS_ID } from "../constants.js";

export const CAMPUS_A = {
  id: APEX_CAMPUS_ID,
  name: "Apex Institute of Technology",
  shortName: "Apex Tech",
  slug: "apex-university",
  domain: "campusconnect.edu",
  location: {
    city: "Bengaluru",
    state: "Karnataka",
    country: "India",
  },
  status: "active",
  branding: {
    logoURL: null,
    primaryColor: "#c2410c", // Atelier terracotta
  },
};

export const CAMPUS_B = {
  id: ST_JUDE_CAMPUS_ID,
  name: "St. Jude University",
  shortName: "St. Jude",
  slug: "st-jude-university",
  domain: "stjude.edu",
  location: {
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
  },
  status: "active",
  branding: {
    logoURL: null,
    primaryColor: "#0284c7", // Sky blue
  },
};

export const CAMPUSES = {
  [APEX_CAMPUS_ID]: CAMPUS_A,
  [ST_JUDE_CAMPUS_ID]: CAMPUS_B,
};

export const CAMPUS_LIST = [CAMPUS_A, CAMPUS_B];
