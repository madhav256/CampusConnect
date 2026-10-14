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

// Event Domain Constants (Milestone 20 - Campus Events & Activities)
export const EVENT_CATEGORIES = {
  ACADEMIC: "academic",
  TECH: "tech",
  CULTURAL: "cultural",
  SPORTS: "sports",
  CAREER: "career",
  WORKSHOP: "workshop",
  SOCIAL: "social",
  COMPETITION: "competition",
};

export const EVENT_CATEGORY_LIST = Object.values(EVENT_CATEGORIES);

export const EVENT_STATUSES = {
  PUBLISHED: "published",
  CANCELLED: "cancelled",
};

export const EVENT_STATUS_LIST = Object.values(EVENT_STATUSES);

export const EVENT_VISIBILITIES = {
  CAMPUS_PUBLIC: "campus_public",
  COMMUNITY_ONLY: "community_only",
};

export const EVENT_VISIBILITY_LIST = Object.values(EVENT_VISIBILITIES);

// Notification Domain Constants (Milestone 23 - Notifications & Delivery Ledger)
export const NOTIFICATION_TYPES = {
  CONNECTION_REQUEST: "connection_request",
  CONNECTION_ACCEPTED: "connection_accepted",
  EVENT_RSVP: "event_rsvp",
  EVENT_CANCELLED: "event_cancelled",
};

export const NOTIFICATION_TYPE_LIST = Object.values(NOTIFICATION_TYPES);

export const DELIVERY_LEDGER_STATUSES = {
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  SUPERSEDED: "superseded",
};

export const DELIVERY_LEDGER_STATUS_LIST = Object.values(DELIVERY_LEDGER_STATUSES);

export const CANCELLATION_DELIVERY_CHUNK_SIZE = 8;