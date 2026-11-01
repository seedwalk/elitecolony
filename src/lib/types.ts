export type Certainty = "confirmed" | "estimated" | "verify-in-game";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Ring {
  name: string;
  type: string; // Rocky | Icy | Metallic | Metal Rich
  hotspots: Record<string, number>;
}

export interface Body {
  id64: number;
  systemId64: number;
  name: string;
  type: "Star" | "Planet" | string;
  subtype: string | null;
  isMainStar: boolean;
  isLandable: boolean;
  gravity: number | null;
  atmosphere: string | null;
  volcanism: string | null;
  terraformingState: string | null;
  distanceToArrival: number | null;
  /** Immediate parent body (first entry of Spansh `parents`). */
  parentId64: number | null;
  parentType: string | null;
  tidallyLocked: boolean;
  bioSignals: number;
  geoSignals: number;
  rings: Ring[];
  hasBelts: boolean;
  reserveLevel: string | null;
  updatedAt: string | null;
}

export interface StarSystem extends Vec3 {
  id64: number;
  name: string;
  population: number;
  isColonised: boolean;
  isBeingColonised: boolean;
  needsPermit: boolean;
  nearestPopulatedDistance: number | null;
  controllingFaction: string | null;
  primaryEconomy: string | null;
  secondaryEconomy: string | null;
  bodyCount: number | null;
  updatedAt: string | null;
  source: "spansh" | "edsm";
  fetchedAt: number;
}

export interface Station {
  id: number;
  systemId64: number;
  systemName: string;
  x: number;
  y: number;
  z: number;
  name: string;
  type: string | null;
  largePads: number;
  mediumPads: number;
  isPlanetary: boolean;
  distanceToArrival: number | null;
  systemIsColonised: boolean;
  /** Construction commodities in stock (supply > 0): name → supply. */
  constructionStock: Record<string, number>;
  marketUpdatedAt: string | null;
  fetchedAt: number;
}

export interface RegionQuery {
  key: string;
  center: Vec3;
  centerName: string | null;
  radius: number;
  fetchedAt: number;
  systemCount: number;
  bodyCount: number;
  stationCount: number;
  status: "done" | "partial" | "error";
  error?: string;
}

export const ROLES = [
  "Capital",
  "Extraction",
  "Refinery",
  "Industrial",
  "Agriculture",
  "HighTech",
  "Military",
  "Logistics",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  Capital: "Capital (Tourism)",
  Extraction: "Extraction (mining)",
  Refinery: "Refinery",
  Industrial: "Industrial",
  Agriculture: "Agriculture",
  HighTech: "High Tech",
  Military: "Military",
  Logistics: "Logistics",
};

export const ROLE_COLOR: Record<Role, string> = {
  Capital: "#f59e0b",
  Extraction: "#ef4444",
  Refinery: "#f97316",
  Industrial: "#a855f7",
  Agriculture: "#22c55e",
  HighTech: "#06b6d4",
  Military: "#64748b",
  Logistics: "#3b82f6",
};

export interface Reason {
  text: string;
  points: number;
  certainty: Certainty;
}

export interface RoleScore {
  score: number; // 0..100
  reasons: Reason[];
}

export type RoleScores = Record<Role, RoleScore>;
