import { dist, SOL } from "../geo";
import type { Body, Reason, Role, StarSystem } from "../types";
import {
  CRITERIA,
  locationScore,
  type Criterion,
  type CriterionScore,
  type PlannerSettings,
} from "./bubbles";
import { systemFacts } from "./classify";
import { ROLE_COVER_THRESHOLD, scoreRoles } from "./roles";
import { weightedScore, type Weights } from "./scoring";

/**
 * Stage 1 of the planner: a coarse scan of a distance-from-Sol band.
 * Only "anchor" systems are downloaded (those with tourism-grade bodies: ELW, WW, AW,
 * black holes, neutron stars, white dwarfs) together with Spansh's body *summary*
 * (type/subtype only — no rings, signals or landable flags). Everything derived here is
 * therefore `estimated`; stage 2 (zone analysis) fetches full data.
 */

export const ANCHOR_SUBTYPES = [
  "Earth-like world",
  "Water world",
  "Ammonia world",
  "Black Hole",
  "Supermassive Black Hole",
  "Neutron Star",
  "White Dwarf (D) Star",
  "White Dwarf (DA) Star",
  "White Dwarf (DAB) Star",
  "White Dwarf (DAO) Star",
  "White Dwarf (DAZ) Star",
  "White Dwarf (DAV) Star",
  "White Dwarf (DB) Star",
  "White Dwarf (DBZ) Star",
  "White Dwarf (DBV) Star",
  "White Dwarf (DO) Star",
  "White Dwarf (DOV) Star",
  "White Dwarf (DQ) Star",
  "White Dwarf (DC) Star",
  "White Dwarf (DCV) Star",
  "White Dwarf (DX) Star",
];

export interface ScanSystem {
  system: StarSystem;
  /** Body summary from the systems search (subtype/type/terraforming only). */
  bodies: Body[];
}

export interface Zone {
  anchorId64: number;
  name: string;
  x: number;
  y: number;
  z: number;
  sunDist: number;
  nearestPopulated: number | null;
  bridgeHops: number;
  neighbours: number;
  /** Target roles plausibly covered by the anchor + nearby anchors (summary-based). */
  coveredRoles: Role[];
  criteria: Record<Criterion, CriterionScore>;
  notes: string[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const NO_LOGISTICS = { nearestMarketLy: null, maxHaulLy: 1 };

export function isClaimable(s: StarSystem): boolean {
  return s.population === 0 && !s.isColonised && !s.isBeingColonised && !s.needsPermit;
}

/** Scores every claimable anchor as the centre of a potential bubble. */
export function scoreZones(scan: ScanSystem[], settings: PlannerSettings): Zone[] {
  const claim = scan.filter((s) => isClaimable(s.system));
  const roles = new Map(
    claim.map((s) => [s.system.id64, scoreRoles(s.bodies, systemFacts(s.bodies, s.system.bodyCount), NO_LOGISTICS)]),
  );
  // Spatial bucketing for neighbour lookups.
  const cell = Math.max(10, settings.maxRadius);
  const grid = new Map<string, ScanSystem[]>();
  const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (const s of claim) {
    const k = key(s.system.x, s.system.y, s.system.z);
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(s);
  }
  const near = (s: StarSystem, r: number): ScanSystem[] => {
    const out: ScanSystem[] = [];
    const cx = Math.floor(s.x / cell);
    const cy = Math.floor(s.y / cell);
    const cz = Math.floor(s.z / cell);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++)
          for (const o of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? [])
            if (o.system.id64 !== s.id64 && dist(o.system, s) <= r) out.push(o);
    return out;
  };

  const econRoles: Role[] = ["Capital", "Extraction", "Refinery", "Industrial", "Agriculture", "HighTech", "Military"];

  return claim.map((a) => {
    const s = a.system;
    const r = roles.get(s.id64)!;
    const nb = near(s, settings.maxRadius);
    const group = [a, ...nb];
    const best = (role: Role) => Math.max(...group.map((g) => roles.get(g.system.id64)![role].score));

    const target = settings.targetRoles.filter((x) => x !== "Logistics");
    const coveredRoles = target.filter((role) =>
      role === "Capital" ? r.Capital.score >= ROLE_COVER_THRESHOLD : best(role) >= ROLE_COVER_THRESHOLD,
    );
    const covFrac = target.length ? coveredRoles.length / target.length : 1;

    const expReasons: Reason[] = [
      { text: `${coveredRoles.length}/${target.length} target roles visible among nearby anchors`, points: Math.round(covFrac * 60), certainty: "estimated" },
      { text: `${nb.length} other claimable anchor systems within ${settings.maxRadius} ly`, points: Math.min(40, nb.length * 5), certainty: "confirmed" },
    ];

    const npd = s.nearestPopulatedDistance;
    let bridgeHops = 0;
    if (npd === null) bridgeHops = -1;
    else if (npd > settings.claimRange) bridgeHops = Math.ceil((npd - settings.claimRange) / settings.claimRange);

    const indReasons: Reason[] = [
      npd === null
        ? { text: "Nearest populated distance unknown", points: 30, certainty: "verify-in-game" }
        : { text: `Nearest populated system ${npd.toFixed(1)} ly`, points: Math.round(70 * Math.min(1, npd / 40)), certainty: "confirmed" },
      { text: "Nearby colonies counted only after zone analysis", points: 15, certainty: "verify-in-game" },
    ];

    const present = econRoles.filter((role) => best(role) >= ROLE_COVER_THRESHOLD);

    const criteria: Record<Criterion, CriterionScore> = {
      expansion: { score: clamp(expReasons.reduce((t, x) => t + x.points, 0)), reasons: expReasons },
      capital: { score: r.Capital.score, reasons: r.Capital.reasons },
      build: {
        score: 50,
        reasons: [{ text: "Markets not scanned yet — analyse the zone", points: 50, certainty: "verify-in-game" }],
      },
      independence: { score: clamp(indReasons.reduce((t, x) => t + x.points, 0)), reasons: indReasons },
      diversity: {
        score: Math.round((present.length / econRoles.length) * 100),
        reasons: [{ text: `Plausible economies nearby: ${present.join(", ") || "none"}`, points: Math.round((present.length / econRoles.length) * 100), certainty: "estimated" }],
      },
      location: locationScore(dist(s, SOL), settings.sunMin, settings.sunMax, settings.sunPreference),
    };

    const notes: string[] = [];
    if (bridgeHops > 0) notes.push(`Needs ~${bridgeHops} bridge outpost(s) to claim`);
    if (bridgeHops < 0) notes.push("Claim reach unknown");
    if (a.bodies.length < (s.bodyCount ?? 0)) notes.push(`Only ${a.bodies.length}/${s.bodyCount} bodies known`);

    return {
      anchorId64: s.id64,
      name: s.name,
      x: s.x,
      y: s.y,
      z: s.z,
      sunDist: dist(s, SOL),
      nearestPopulated: npd,
      bridgeHops,
      neighbours: nb.length,
      coveredRoles,
      criteria,
      notes,
    };
  });
}

export interface RankedZone {
  zone: Zone;
  score: number;
}

export function rankZones(zones: Zone[], w: Weights): RankedZone[] {
  return zones
    .map((zone) => ({ zone, score: weightedScore(zone, w) }))
    .sort((a, b) => b.score - a.score || a.zone.name.localeCompare(b.zone.name));
}

/** Greedy pick of the best zones whose centres are at least `minSeparation` ly apart. */
export function pickDistinctZones(ranked: RankedZone[], n: number, minSeparation: number): RankedZone[] {
  const out: RankedZone[] = [];
  for (const r of ranked) {
    if (out.length >= n) break;
    if (out.every((o) => dist(o.zone, r.zone) >= minSeparation)) out.push(r);
  }
  return out;
}

export { CRITERIA };
