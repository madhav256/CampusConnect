// Constants for CampusConnect

export const POSTS_PER_PAGE = 10;

// Campus Identifiers (Milestone 18 - Multi-Tenancy)
export const APEX_CAMPUS_ID = "apex-university";
export const ST_JUDE_CAMPUS_ID = "st-jude-university";
export const DEFAULT_CAMPUS_ID = APEX_CAMPUS_ID;

// Community Domain Constants (Milestone 19 - Communities & Discovery)
export const COMMUNITY_CATEGORIES = {
  ACADEMIC: "academic",
  CULTURAL: "cultural",
  TECH: "tech",
  SPORTS: "sports",
  CAREER: "career",
  BATCH: "batch",
  INTEREST: "interest",
};

export const COMMUNITY_CATEGORY_LIST = Object.values(COMMUNITY_CATEGORIES);

export const COMMUNITY_STATUSES = {
  ACTIVE: "active",
  ARCHIVED: "archived",
  PENDING_APPROVAL: "pending_approval",
};

export const COMMUNITY_STATUS_LIST = Object.values(COMMUNITY_STATUSES);

export const COMMUNITY_VISIBILITIES = {
  CAMPUS_PUBLIC: "campus_public",
  CAMPUS_PRIVATE: "campus_private",
};

export const COMMUNITY_VISIBILITY_LIST = Object.values(COMMUNITY_VISIBILITIES);

// Community Membership Constants (Milestone 19.2 - Membership & Security Authority)
export const COMMUNITY_MEMBER_ROLES = {
  MEMBER: "member",
  MODERATOR: "moderator",
  ADMIN: "admin",
};

export const COMMUNITY_MEMBER_ROLE_LIST = Object.values(COMMUNITY_MEMBER_ROLES);

export const COMMUNITY_MEMBER_STATUSES = {
  ACTIVE: "active",
  REMOVED: "removed",
  PENDING: "pending",
};

export const COMMUNITY_MEMBER_STATUS_LIST = Object.values(COMMUNITY_MEMBER_STATUSES);