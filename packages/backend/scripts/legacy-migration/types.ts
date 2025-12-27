// Legacy Migration Types
// Types representing data structures from fightingtomatoes.com MySQL database

// ============== LEGACY DATA STRUCTURES ==============

// Note: Using index signature to satisfy Record<string, unknown> constraint
export interface LegacyUser {
  [key: string]: unknown;
  id: number;
  emailaddress: string;
  password: string;
  salt: string;
  maptoemail: string; // MD5 hash of email - used to find user's tables
  displayname: string;
  ismedia: number;
  mediaorganization: string;
  mediaorganizationwebsite: string;
  avatar: string;
  wantsemail: number;
  confirmedemail: number;
  reviewerscore: number;
  numreviews: number;
  signupmethod: string;
  signupdatetime: string;
  deleted: number;
}

export interface LegacyFight {
  [key: string]: unknown;
  id: number;
  promotion: string;
  eventname: string;
  prelimcode: string; // "Main", "Prelim", "Early"
  orderoncard: number;
  date: string; // YYYY-MM-DD
  f1id: number;
  f1fn: string; // fighter 1 first name
  f1ln: string; // fighter 1 last name
  f1nn: string; // fighter 1 nickname
  f2id: number;
  f2fn: string; // fighter 2 first name
  f2ln: string; // fighter 2 last name
  f2nn: string; // fighter 2 nickname
  weightclass: string;
  istitle: number;
  winner: string;
  method: string;
  round: number;
  time: string;
  numvotes: number;
  percentscore: number;
  deleted: number;
}

export interface LegacyRating {
  [key: string]: unknown;
  id: number;
  fightid: string;
  score: number; // 1-10
  excited: number;
  time_of_rating: string; // Unix timestamp as string
  userEmailHash: string; // MD5 hash table name
  userEmail?: string; // Resolved email
}

export interface LegacyReview {
  [key: string]: unknown;
  id: number;
  commentid: string;
  score: number;
  comment: string;
  link: string;
  linktitle: string;
  ismedia: number;
  avatar: string;
  displayname: string;
  date: string;
  helpful: number;
  commenteremail: string;
  mediaorganization: string;
  mediaorganizationwebsite: string;
  fightid: number;
}

export interface LegacyTag {
  [key: string]: unknown;
  fightid: string;
  tagid: string;
  userEmailHash: string; // MD5 hash table name
  userEmail?: string; // Resolved email
}

// ============== MAPPING STRUCTURES ==============

export interface FightMapping {
  legacyId: number;
  newId: string; // UUID
  fighter1Name: string;
  fighter2Name: string;
  date: string;
  eventName: string;
}

export interface UserMapping {
  legacyId: number;
  legacyEmail: string;
  legacyEmailHash: string; // MD5 hash
  newId: string; // UUID
}

export interface TagMapping {
  legacyId: number;
  newId: string; // UUID
  name: string;
}

// ============== MIGRATION STATS ==============

export interface MigrationStats {
  users: {
    total: number;
    imported: number;
    skipped: number;
    errors: number;
  };
  ratings: {
    total: number;
    imported: number;
    skipped: number;
    unmatchedFights: number;
    errors: number;
  };
  reviews: {
    total: number;
    imported: number;
    skipped: number;
    unmatchedFights: number;
    unmatchedUsers: number;
    errors: number;
  };
  tags: {
    total: number;
    imported: number;
    skipped: number;
    unmatchedFights: number;
    errors: number;
  };
  fights: {
    totalLegacy: number;
    matched: number;
    unmatched: number;
  };
}

// ============== PARSED SQL DATA ==============

export interface ParsedLegacyData {
  users: LegacyUser[];
  fights: LegacyFight[];
  ratings: LegacyRating[];
  reviews: LegacyReview[];
  tags: LegacyTag[];
  emailHashMap: Map<string, string>; // hash -> email
}
