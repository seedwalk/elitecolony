import type { Body, Ring, StarSystem, Station } from "../types";

/** Commodities used by colonisation construction sites (bulk ones first). Source: community guide; list is `estimated`. */
export const CONSTRUCTION_COMMODITIES = [
  "Steel",
  "Aluminium",
  "CMM Composite",
  "Ceramic Composites",
  "Titanium",
  "Copper",
  "Liquid oxygen",
  "Polymers",
  "Water",
  "Insulating Membrane",
  "Semiconductors",
  "Superconductors",
  "Computer Components",
  "Food Cartridges",
  "Fruit and Vegetables",
  "Power Generators",
  "Water Purifiers",
  "Medical Diagnostic Equipment",
  "Non-Lethal Weapons",
  "Building Fabricators",
  "Emergency Power Cells",
  "Survival Equipment",
  "Structural Regulators",
  "Evacuation Shelter",
] as const;

const CONSTRUCTION_SET = new Set<string>(CONSTRUCTION_COMMODITIES.map((c) => c.toLowerCase()));

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = Record<string, any>;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

export function normalizeSystem(r: Raw, fetchedAt: number): StarSystem {
  return {
    id64: Number(r.id64),
    name: String(r.name),
    x: Number(r.x),
    y: Number(r.y),
    z: Number(r.z),
    population: num(r.population) ?? 0,
    isColonised: r.is_colonised === true,
    isBeingColonised: r.is_being_colonised === true,
    needsPermit: r.needs_permit === true,
    nearestPopulatedDistance: num(r.nearest_populated_distance),
    controllingFaction: str(r.controlling_minor_faction),
    primaryEconomy: str(r.primary_economy),
    secondaryEconomy: str(r.secondary_economy),
    bodyCount: num(r.body_count),
    updatedAt: str(r.updated_at),
    source: "spansh",
    fetchedAt,
  };
}

function normalizeRing(r: Raw): Ring {
  const hotspots: Record<string, number> = {};
  if (Array.isArray(r.signals)) {
    for (const s of r.signals) if (s?.name) hotspots[String(s.name)] = Number(s.count) || 0;
  }
  return { name: String(r.name ?? ""), type: String(r.type ?? ""), hotspots };
}

function signalCount(signals: unknown, name: string): number {
  if (!Array.isArray(signals)) return 0;
  const s = signals.find((x: Raw) => String(x?.name).toLowerCase() === name);
  return s ? Number(s.count) || 0 : 0;
}

export function normalizeBody(r: Raw): Body {
  const parent = Array.isArray(r.parents) && r.parents.length > 0 ? r.parents[0] : null;
  return {
    id64: Number(r.id64),
    systemId64: Number(r.system_id64),
    name: String(r.name),
    type: String(r.type ?? ""),
    subtype: str(r.subtype),
    isMainStar: r.is_main_star === true,
    isLandable: r.is_landable === true,
    gravity: num(r.gravity),
    atmosphere: str(r.atmosphere),
    volcanism: str(r.volcanism_type),
    terraformingState: str(r.terraforming_state),
    distanceToArrival: num(r.distance_to_arrival),
    parentId64: parent && parent.type !== "Null" ? Number(parent.id64) : null,
    parentType: parent ? String(parent.type) : null,
    tidallyLocked: r.is_rotational_period_tidally_locked === true,
    bioSignals: signalCount(r.signals, "biological"),
    geoSignals: signalCount(r.signals, "geological"),
    rings: Array.isArray(r.rings) ? r.rings.map(normalizeRing) : [],
    hasBelts: Array.isArray(r.belts) && r.belts.length > 0,
    reserveLevel: str(r.reserve_level),
    updatedAt: str(r.updated_at),
  };
}

export function normalizeStation(r: Raw, fetchedAt: number): Station {
  const constructionStock: Record<string, number> = {};
  if (Array.isArray(r.market)) {
    for (const m of r.market) {
      const name = String(m?.commodity ?? "");
      if (CONSTRUCTION_SET.has(name.toLowerCase()) && Number(m.supply) > 0) {
        constructionStock[name] = Number(m.supply);
      }
    }
  }
  return {
    id: Number(r.id ?? r.market_id),
    systemId64: Number(r.system_id64),
    systemName: String(r.system_name ?? ""),
    x: Number(r.system_x),
    y: Number(r.system_y),
    z: Number(r.system_z),
    name: String(r.name),
    type: str(r.type),
    largePads: num(r.large_pads) ?? (r.has_large_pad ? 1 : 0),
    mediumPads: num(r.medium_pads) ?? 0,
    isPlanetary: r.is_planetary === true,
    distanceToArrival: num(r.distance_to_arrival),
    systemIsColonised: r.system_is_colonised === true,
    constructionStock,
    marketUpdatedAt: str(r.market_updated_at),
    fetchedAt,
  };
}

/** Body *summary* embedded in systems-search results (no rings/signals/landable). */
export function normalizeSummaryBodies(r: Raw): Body[] {
  if (!Array.isArray(r.bodies)) return [];
  const systemId64 = Number(r.id64);
  return r.bodies.map((b: Raw) => ({
    ...normalizeBody({ ...b, system_id64: systemId64 }),
    isMainStar: b.is_main_star === true,
  }));
}
