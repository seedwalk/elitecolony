import { dist, SOL } from "../geo";
import type { Body, Reason, Role, RoleScores, StarSystem, Station } from "../types";
import { systemFacts, type SystemFacts } from "./classify";
import { ROLE_COVER_THRESHOLD, scoreRoles } from "./roles";

export const CRITERIA = ["expansion", "capital", "build", "independence", "diversity", "location"] as const;
export type Criterion = (typeof CRITERIA)[number];

export const CRITERION_LABEL: Record<Criterion, string> = {
  expansion: "Regional expansion",
  capital: "Capital quality",
  build: "Build & supply",
  independence: "Independence",
  diversity: "Economic diversity",
  location: "Location (distance to Sol)",
};

export type SunPreference = "outer" | "inner" | "neutral";

/**
 * Location score: where a point sits inside the [sunMin, sunMax] band, according to the
 * user's preference (outer = farther from Sol is better).
 */
export function locationScore(sunDist: number, sunMin: number, sunMax: number, pref: SunPreference): CriterionScore {
  const span = Math.max(1, sunMax - sunMin);
  const t = Math.max(0, Math.min(1, (sunDist - sunMin) / span));
  const score = pref === "neutral" ? 50 : Math.round((pref === "outer" ? t : 1 - t) * 100);
  return {
    score,
    reasons: [
      {
        text: `${sunDist.toFixed(0)} ly from Sol (band ${sunMin}–${sunMax} ly, prefer ${pref})`,
        points: score,
        certainty: "confirmed",
      },
    ],
  };
}

export interface LogisticsSettings {
  hasFleetCarrier: boolean;
  minPad: "L" | "M";
  maxHaulLy: number;
}

export interface PlannerSettings {
  targetRoles: Role[];
  sizeMin: number;
  sizeMax: number;
  maxHop: number;
  maxRadius: number;
  claimRange: number;
  beamWidth: number;
  maxCapitals: number;
  logistics: LogisticsSettings;
  /** Distance-from-Sol band used for frontier scans and the Location criterion. */
  sunMin: number;
  sunMax: number;
  sunPreference: SunPreference;
  /** Max bridge outposts allowed to reach a capital (0 = directly claimable only, -1 = any). */
  maxBridges: number;
  /** If set, only these systems are considered as capitals (pasted list). */
  capitalFilter?: number[];
}

export const DEFAULT_SETTINGS: PlannerSettings = {
  targetRoles: ["Capital", "Extraction", "Refinery", "Industrial", "Agriculture", "Logistics"],
  sizeMin: 1,
  sizeMax: 8,
  maxHop: 15,
  maxRadius: 35,
  claimRange: 15,
  beamWidth: 6,
  maxCapitals: 120,
  logistics: { hasFleetCarrier: false, minPad: "L", maxHaulLy: 40 },
  sunMin: 250,
  sunMax: 350,
  sunPreference: "outer",
  maxBridges: 0,
};

/** True when a capital's claim chain fits the user's bridge limit (unknown reach only passes with "any"). */
export function withinBridgeLimit(bridgeHops: number, maxBridges: number): boolean {
  if (maxBridges < 0) return true;
  return bridgeHops >= 0 && bridgeHops <= maxBridges;
}

/** Effective haul range (Fleet Carrier ×5). */
export function haulRange(l: LogisticsSettings): number {
  return l.maxHaulLy * (l.hasFleetCarrier ? 5 : 1);
}

/** How far around a system we look for (and download) construction markets. */
export function marketSearchRange(l: LogisticsSettings): number {
  return Math.min(150, Math.max(40, haulRange(l)));
}

/** Points lost per bridge outpost needed to reach the capital (each = 25 M cr claim + an outpost build). */
export const BRIDGE_PENALTY = 12;

export function bridgeHopsFor(originDistance: number | null, claimRange: number): number {
  if (originDistance === null) return -1;
  return originDistance <= claimRange ? 0 : Math.ceil((originDistance - claimRange) / claimRange);
}

export const RISK_LABEL = {
  missing_roles: "Missing target roles",
  no_market: "No construction market in range",
  far_market: "Market beyond haul range",
  colony_in_range: "Colony within claim range",
  active_claims: "Active claim within claim range",
  bridge: "Needs bridge outposts",
  unknown_reach: "Claim reach unknown",
  long_hop: "Hop longer than claim range",
} as const;
export type RiskCode = keyof typeof RISK_LABEL;

/** Other colonies around a bubble (colonised or being colonised systems). */
export interface Competition {
  /** Populated/colonised system you would claim the capital from (excluded from competition). */
  claimContactName: string | null;
  claimContactLy: number | null;
  /** Closest colony to any bubble member. */
  nearestColonyLy: number | null;
  nearestColonyName: string | null;
  /** Colonies within claim range (15 ly) of any member — they can claim your neighbours. */
  inClaimRange: number;
  /** Of those, systems being colonised right now. */
  activeInClaimRange: number;
  /** Colonies within the bubble search radius of the capital. */
  inRadius: number;
  activeInRadius: number;
}

export interface MarketRef {
  stationName: string;
  systemName: string;
  systemId64: number;
  ly: number;
  largePads: number;
  commodities: number;
}

export interface SystemAnalysis {
  system: StarSystem;
  facts: SystemFacts;
  roles: RoleScores;
  nearestMarket: MarketRef | null;
  claimable: boolean;
  status: string;
  /** Distance to nearest system assumed to have a colonisation contact. */
  originDistance: number | null;
  missing: string[];
}

export interface CriterionScore {
  score: number;
  reasons: Reason[];
}

export interface Bubble {
  capitalId64: number;
  size: number;
  members: number[];
  assignment: Record<number, Role[]>;
  uncovered: Role[];
  maxHop: number;
  radius: number;
  avgToCapital: number;
  spareNeighbours: number;
  criteria: Record<Criterion, CriterionScore>;
  advantages: string[];
  risks: string[];
  /** Machine-readable risk categories (for filtering). */
  riskCodes: RiskCode[];
  competition: Competition;
  missing: string[];
  bridgeHops: number;
}

export interface CapitalResult {
  capitalId64: number;
  bubbles: Bubble[];
}

export interface RegionInput {
  systems: StarSystem[];
  bodies: Body[];
  stations: Station[];
  settings: PlannerSettings;
}

export interface RegionResult {
  systems: SystemAnalysis[];
  capitals: CapitalResult[];
  stats: { candidates: number; capitalsEvaluated: number; ms: number };
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/* ------------------------------------------------------------------ */
/* Spatial grid for neighbour queries                                  */
/* ------------------------------------------------------------------ */

class Grid {
  private cells = new Map<string, number[]>();
  constructor(
    private points: { x: number; y: number; z: number }[],
    private cell: number,
  ) {
    points.forEach((p, i) => {
      const k = this.key(p.x, p.y, p.z);
      const arr = this.cells.get(k);
      if (arr) arr.push(i);
      else this.cells.set(k, [i]);
    });
  }
  private key(x: number, y: number, z: number) {
    return `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)},${Math.floor(z / this.cell)}`;
  }
  within(p: { x: number; y: number; z: number }, r: number): number[] {
    const out: number[] = [];
    const span = Math.ceil(r / this.cell);
    const cx = Math.floor(p.x / this.cell);
    const cy = Math.floor(p.y / this.cell);
    const cz = Math.floor(p.z / this.cell);
    for (let dx = -span; dx <= span; dx++)
      for (let dy = -span; dy <= span; dy++)
        for (let dz = -span; dz <= span; dz++) {
          const arr = this.cells.get(`${cx + dx},${cy + dy},${cz + dz}`);
          if (!arr) continue;
          for (const i of arr) if (dist(p, this.points[i]) <= r) out.push(i);
        }
    return out;
  }
}

/* ------------------------------------------------------------------ */
/* Per-system analysis                                                 */
/* ------------------------------------------------------------------ */

function usableMarket(s: Station, minPad: "L" | "M"): boolean {
  if (Object.keys(s.constructionStock).length === 0) return false;
  return minPad === "L" ? s.largePads > 0 : s.largePads > 0 || s.mediumPads > 0;
}

export function analyseSystems(input: RegionInput): SystemAnalysis[] {
  const { systems, bodies, stations, settings } = input;
  const byId = new Map<number, Body[]>();
  for (const b of bodies) {
    const arr = byId.get(b.systemId64);
    if (arr) arr.push(b);
    else byId.set(b.systemId64, [b]);
  }
  const markets = stations.filter((s) => usableMarket(s, settings.logistics.minPad));
  const origins = systems.filter((s) => s.population > 0 || s.isColonised);

  return systems.map((sys) => {
    const sb = byId.get(sys.id64) ?? [];
    const facts = systemFacts(sb, sys.bodyCount);

    let nearestMarket: MarketRef | null = null;
    const searchLy = marketSearchRange(settings.logistics);
    for (const m of markets) {
      const d = dist(sys, m);
      if (d > searchLy) continue; // beyond what was downloaded: unknown, not "nearest"
      if (!nearestMarket || d < nearestMarket.ly)
        nearestMarket = {
          stationName: m.name,
          systemName: m.systemName,
          systemId64: m.systemId64,
          ly: d,
          largePads: m.largePads,
          commodities: Object.keys(m.constructionStock).length,
        };
    }

    const haul = haulRange(settings.logistics);
    const roles = scoreRoles(sb, facts, { nearestMarketLy: nearestMarket?.ly ?? null, maxHaulLy: haul });

    let status = "Available";
    let claimable = true;
    if (sys.population > 0) {
      status = "Populated";
      claimable = false;
    } else if (sys.isColonised) {
      status = "Colonised";
      claimable = false;
    } else if (sys.isBeingColonised) {
      status = "Being colonised";
      claimable = false;
    } else if (sys.needsPermit) {
      status = "Permit locked";
      claimable = false;
    }

    let originDistance: number | null = null;
    for (const o of origins) {
      if (o.id64 === sys.id64) continue;
      const d = dist(sys, o);
      if (originDistance === null || d < originDistance) originDistance = d;
    }
    const npd = sys.population > 0 ? 0 : sys.nearestPopulatedDistance;
    if (npd !== null && (originDistance === null || npd < originDistance)) originDistance = npd;

    const missing: string[] = [];
    if (sb.length === 0) missing.push("No body data (system not scanned on Spansh)");
    else if (facts.bodyCount > facts.scannedBodies)
      missing.push(`Only ${facts.scannedBodies}/${facts.bodyCount} bodies scanned`);
    if (facts.ringedBodies > 0 && facts.hotspots === 0) missing.push("Rings without hotspot data (DSS needed)");
    if (!facts.reserve) missing.push("Reserve level unknown");
    if (sys.updatedAt && Date.now() - Date.parse(sys.updatedAt) > 365 * 864e5)
      missing.push("Data older than 1 year");

    return { system: sys, facts, roles, nearestMarket, claimable, status, originDistance, missing };
  });
}

/* ------------------------------------------------------------------ */
/* Bubble evaluation                                                   */
/* ------------------------------------------------------------------ */

interface Ctx {
  sa: SystemAnalysis[];
  claimIdx: number[]; // indices (into sa) of claimable systems
  claimGrid: Grid; // over claimIdx positions
  othersGrid: Grid; // over non-claimable (populated/colonised/being colonised)
  others: SystemAnalysis[];
  settings: PlannerSettings;
}

function assign(members: number[], ctx: Ctx) {
  const { sa, settings } = ctx;
  const assignment: Record<number, Role[]> = {};
  const uncovered: Role[] = [];
  let coverageSum = 0;
  for (const m of members) assignment[sa[m].system.id64] = [];
  for (const role of settings.targetRoles) {
    let best = -1;
    let bestScore = -1;
    if (role === "Capital") {
      best = members[0];
      bestScore = sa[best].roles.Capital.score;
    } else {
      for (const m of members) {
        const s = sa[m].roles[role].score;
        if (s > bestScore) {
          bestScore = s;
          best = m;
        }
      }
    }
    coverageSum += Math.min(100, bestScore);
    if (bestScore >= ROLE_COVER_THRESHOLD || role === "Capital") assignment[sa[best].system.id64].push(role);
    else uncovered.push(role);
  }
  const coverage = settings.targetRoles.length ? coverageSum / settings.targetRoles.length : 0;
  return { assignment, uncovered, coverage };
}

function geometry(members: number[], ctx: Ctx) {
  const pts = members.map((m) => ctx.sa[m].system);
  const cap = pts[0];
  let radius = 0;
  let sumToCap = 0;
  let maxHop = 0;
  for (let i = 0; i < pts.length; i++) {
    const dc = dist(cap, pts[i]);
    radius = Math.max(radius, dc);
    sumToCap += dc;
    if (i > 0) {
      let nearest = Infinity;
      for (let j = 0; j < pts.length; j++) if (j !== i) nearest = Math.min(nearest, dist(pts[i], pts[j]));
      maxHop = Math.max(maxHop, nearest);
    }
  }
  return { radius, maxHop, avgToCapital: pts.length > 1 ? sumToCap / (pts.length - 1) : 0 };
}

/** Weight-independent objective used to steer the beam search. */
function objective(members: number[], ctx: Ctx): number {
  const { coverage } = assign(members, ctx);
  const g = geometry(members, ctx);
  return coverage - 0.3 * g.avgToCapital;
}

function frontier(members: number[], capital: number, ctx: Ctx): number[] {
  const inSet = new Set(members);
  const capSys = ctx.sa[capital].system;
  const out = new Set<number>();
  for (const m of members) {
    for (const gi of ctx.claimGrid.within(ctx.sa[m].system, ctx.settings.maxHop)) {
      const idx = ctx.claimIdx[gi];
      if (inSet.has(idx)) continue;
      if (dist(capSys, ctx.sa[idx].system) > ctx.settings.maxRadius) continue;
      out.add(idx);
    }
  }
  return [...out];
}

export function evaluateBubble(members: number[], ctx: Ctx): Bubble {
  const { sa, settings } = ctx;
  const capital = sa[members[0]];
  const { assignment, uncovered, coverage } = assign(members, ctx);
  const g = geometry(members, ctx);
  const memberSet = new Set(members);

  // spare claimable neighbours (room to grow later)
  const spare = new Set<number>();
  for (const m of members)
    for (const gi of ctx.claimGrid.within(sa[m].system, settings.maxHop)) {
      const idx = ctx.claimIdx[gi];
      if (!memberSet.has(idx)) spare.add(idx);
    }

  const advantages: string[] = [];
  const risks: string[] = [];
  const riskCodes: RiskCode[] = [];
  const risk = (code: RiskCode, text: string) => {
    risks.push(text);
    if (!riskCodes.includes(code)) riskCodes.push(code);
  };
  const missing = new Set<string>();
  for (const m of members) for (const x of sa[m].missing) missing.add(`${sa[m].system.name}: ${x}`);

  // Expansion
  const covered = settings.targetRoles.length - uncovered.length;
  const covFrac = settings.targetRoles.length ? covered / settings.targetRoles.length : 1;
  const expansion: CriterionScore = {
    score: 0,
    reasons: [
      { text: `${covered}/${settings.targetRoles.length} target roles covered`, points: Math.round(covFrac * 45), certainty: "estimated" },
      { text: `Average role strength ${Math.round(coverage)}/100`, points: Math.round(coverage * 0.15), certainty: "estimated" },
      { text: `${spare.size} spare claimable neighbours`, points: Math.min(20, spare.size * 2), certainty: "confirmed" },
      {
        text: `Compactness: avg ${g.avgToCapital.toFixed(1)} ly to capital`,
        points: Math.round(20 * clamp(1 - g.avgToCapital / Math.max(1, settings.maxRadius), 0, 1)),
        certainty: "confirmed",
      },
    ],
  };
  expansion.score = clamp(expansion.reasons.reduce((s, r) => s + r.points, 0));
  if (uncovered.length === 0) advantages.push(`All ${settings.targetRoles.length} target roles covered in ${members.length} system(s)`);
  else risk("missing_roles", `Missing roles: ${uncovered.join(", ")}`);

  // Capital
  const capitalScore: CriterionScore = { score: capital.roles.Capital.score, reasons: capital.roles.Capital.reasons };
  if (capital.roles.Capital.score >= 60) advantages.push(`Strong tourism capital (${capital.roles.Capital.score})`);

  // Build & supply
  const lg = settings.logistics;
  const haul = haulRange(lg);
  const bridgeHops = bridgeHopsFor(capital.originDistance, settings.claimRange);
  const buildReasons: Reason[] = [];
  const mk = capital.nearestMarket;
  if (mk) {
    buildReasons.push({
      text: `Nearest ${lg.minPad}-pad construction market: ${mk.stationName} (${mk.systemName}) ${mk.ly.toFixed(1)} ly`,
      points: Math.round(70 * clamp(1 - mk.ly / Math.max(1, haul), 0, 1)),
      certainty: "confirmed",
    });
    if (mk.ly > haul) risk("far_market", `Nearest market ${mk.ly.toFixed(0)} ly away exceeds haul limit (${haul} ly)`);
  } else {
    buildReasons.push({
      text: `No construction market within ${marketSearchRange(lg)} ly (searched)`,
      points: 0,
      certainty: "verify-in-game",
    });
    risk("no_market", "No known construction market nearby");
  }
  if (lg.hasFleetCarrier) buildReasons.push({ text: "Fleet Carrier extends haul range ×5", points: 0, certainty: "estimated" });
  buildReasons.push({
    text: `Internal hauling: avg ${g.avgToCapital.toFixed(1)} ly between capital and members`,
    points: Math.round(30 * clamp(1 - g.avgToCapital / Math.max(1, settings.maxRadius), 0, 1)),
    certainty: "confirmed",
  });
  if (bridgeHops > 0)
    buildReasons.push({
      text: `${bridgeHops} bridge outpost(s) needed to reach the capital`,
      points: -BRIDGE_PENALTY * bridgeHops,
      certainty: "estimated",
    });
  const build: CriterionScore = { score: clamp(buildReasons.reduce((s, r) => s + r.points, 0)), reasons: buildReasons };

  // Independence & competition.
  // The populated/colonised system you claim FROM (your "claim contact") is required for a direct
  // claim, so it is excluded from everything below: it is not competition.
  const isInhabited = (o: SystemAnalysis) => o.system.population > 0 || o.system.isColonised || o.system.isBeingColonised;
  const isColony = (o: SystemAnalysis) => o.system.isColonised || o.system.isBeingColonised;
  const reach = settings.maxRadius + settings.claimRange;
  const around = ctx.othersGrid.within(capital.system, reach).map((i) => ctx.others[i]);

  let contact: SystemAnalysis | null = null;
  let contactLy = Infinity;
  for (const o of around) {
    if (!(o.system.population > 0 || o.system.isColonised)) continue;
    const d = dist(capital.system, o.system);
    if (d < contactLy) {
      contactLy = d;
      contact = o;
    }
  }
  if (!contact || contactLy > settings.claimRange) contact = null;
  const notContact = (o: SystemAnalysis) => o.system.id64 !== contact?.system.id64;

  let nearestOtherLy: number | null = null;
  let nearestOtherName: string | null = null;
  let nearestColonyLy: number | null = null;
  let nearestColonyName: string | null = null;
  const inClaim = new Set<number>();
  const activeInClaim = new Set<number>();
  for (const o of around) {
    if (!isInhabited(o) || !notContact(o)) continue;
    for (const m of members) {
      const d = dist(sa[m].system, o.system);
      if (nearestOtherLy === null || d < nearestOtherLy) {
        nearestOtherLy = d;
        nearestOtherName = o.system.name;
      }
      if (isColony(o) && (nearestColonyLy === null || d < nearestColonyLy)) {
        nearestColonyLy = d;
        nearestColonyName = o.system.name;
      }
      if (isColony(o) && d <= settings.claimRange) {
        inClaim.add(o.system.id64);
        if (o.system.isBeingColonised) activeInClaim.add(o.system.id64);
      }
    }
  }
  const inRadiusList = around.filter((o) => isColony(o) && notContact(o) && dist(capital.system, o.system) <= settings.maxRadius);
  const competition: Competition = {
    claimContactName: contact?.system.name ?? null,
    claimContactLy: contact ? contactLy : null,
    nearestColonyLy,
    nearestColonyName,
    inClaimRange: inClaim.size,
    activeInClaimRange: activeInClaim.size,
    inRadius: inRadiusList.length,
    activeInRadius: inRadiusList.filter((o) => o.system.isBeingColonised).length,
  };

  const indReasons: Reason[] = [
    nearestOtherLy === null
      ? { text: `No other inhabited system within ${reach} ly (besides your claim contact)`, points: 60, certainty: "confirmed" }
      : {
          text: `Nearest other inhabited system ${nearestOtherLy.toFixed(1)} ly (${nearestOtherName}) — claim contact excluded`,
          points: Math.round(60 * clamp(nearestOtherLy / (settings.claimRange * 2), 0, 1)),
          certainty: "confirmed",
        },
    {
      text: `${inClaim.size} other colon${inClaim.size === 1 ? "y" : "ies"} within ${settings.claimRange} ly of the bubble`,
      points: Math.max(0, 40 - inClaim.size * 15),
      certainty: "confirmed",
    },
  ];
  const independence: CriterionScore = { score: clamp(indReasons.reduce((s, r) => s + r.points, 0)), reasons: indReasons };
  if (inClaim.size > 0)
    risk(
      "colony_in_range",
      `${inClaim.size} other colon${inClaim.size > 1 ? "ies" : "y"} within ${settings.claimRange} ly of the bubble — they can claim your neighbours (nearest ${nearestColonyLy!.toFixed(1)} ly: ${nearestColonyName})`,
    );
  if (activeInClaim.size > 0)
    risk("active_claims", `${activeInClaim.size} system(s) being colonised right now within ${settings.claimRange} ly of the bubble`);

  // Diversity: all economy roles (not only targets)
  const econRoles: Role[] = ["Capital", "Extraction", "Refinery", "Industrial", "Agriculture", "HighTech", "Military"];
  const present = econRoles.filter((r) => members.some((m) => sa[m].roles[r].score >= ROLE_COVER_THRESHOLD));
  const diversity: CriterionScore = {
    score: Math.round((present.length / econRoles.length) * 100),
    reasons: [{ text: `Viable economies: ${present.join(", ") || "none"}`, points: Math.round((present.length / econRoles.length) * 100), certainty: "estimated" }],
  };

  // Claim chain
  const od = capital.originDistance;
  if (od === null || od > settings.claimRange) {
    if (od === null) risk("unknown_reach", "No colonisation contact found nearby — bridge length unknown");
    else risk("bridge", `Capital is ${od.toFixed(1)} ly from nearest contact: needs ~${bridgeHops} bridge outpost(s)`);
  } else {
    advantages.push(
      contact
        ? `Capital claimable directly from ${contact.system.name} (${contactLy.toFixed(1)} ly)`
        : `Capital claimable directly (${od.toFixed(1)} ly from a populated system)`,
    );
  }
  if (g.maxHop > settings.claimRange) risk("long_hop", `A hop of ${g.maxHop.toFixed(1)} ly exceeds the ${settings.claimRange} ly claim range`);

  return {
    capitalId64: capital.system.id64,
    size: members.length,
    members: members.map((m) => sa[m].system.id64),
    assignment,
    uncovered,
    maxHop: g.maxHop,
    radius: g.radius,
    avgToCapital: g.avgToCapital,
    spareNeighbours: spare.size,
    criteria: {
      expansion,
      capital: capitalScore,
      build,
      independence,
      diversity,
      location: locationScore(dist(capital.system, SOL), settings.sunMin, settings.sunMax, settings.sunPreference),
    },
    advantages,
    risks,
    riskCodes,
    competition,
    missing: [...missing],
    bridgeHops,
  };
}

/* ------------------------------------------------------------------ */
/* Beam search                                                         */
/* ------------------------------------------------------------------ */

function bestPerSize(capital: number, ctx: Ctx): Bubble[] {
  const { sizeMin, sizeMax, beamWidth } = ctx.settings;
  const results: Bubble[] = [];
  let beam: number[][] = [[capital]];
  for (let size = 1; size <= sizeMax; size++) {
    if (size > 1) {
      const seen = new Set<string>();
      const next: { m: number[]; o: number }[] = [];
      for (const state of beam) {
        for (const cand of frontier(state, capital, ctx)) {
          const m = [state[0], ...[...state.slice(1), cand].sort((a, b) => a - b)];
          const key = m.join(",");
          if (seen.has(key)) continue;
          seen.add(key);
          next.push({ m, o: objective(m, ctx) });
        }
      }
      if (next.length === 0) break;
      next.sort((a, b) => b.o - a.o);
      beam = next.slice(0, beamWidth).map((n) => n.m);
    }
    if (size >= sizeMin) results.push(evaluateBubble(beam[0], ctx));
  }
  return results;
}

export function analyseRegion(input: RegionInput): RegionResult {
  const t0 = Date.now();
  const { settings } = input;
  const sa = analyseSystems(input);
  const claimIdx = sa.map((s, i) => (s.claimable ? i : -1)).filter((i) => i >= 0);
  const others = sa.filter((s) => !s.claimable);
  const ctx: Ctx = {
    sa,
    claimIdx,
    claimGrid: new Grid(
      claimIdx.map((i) => sa[i].system),
      Math.max(5, settings.maxHop),
    ),
    others,
    othersGrid: new Grid(
      others.map((s) => s.system),
      Math.max(5, settings.maxRadius),
    ),
    settings,
  };

  // Pre-rank capital candidates: capital quality + best role coverage within reach.
  let pool = claimIdx.filter((i) =>
    withinBridgeLimit(bridgeHopsFor(sa[i].originDistance, settings.claimRange), settings.maxBridges),
  );
  if (settings.capitalFilter?.length) {
    const f = new Set(settings.capitalFilter);
    pool = claimIdx.filter((i) => f.has(sa[i].system.id64));
  }
  const pre = pool.map((i) => {
    const near = ctx.claimGrid
      .within(sa[i].system, Math.min(settings.maxRadius, settings.maxHop * 2))
      .map((gi) => claimIdx[gi]);
    let cov = 0;
    for (const role of settings.targetRoles) {
      if (role === "Capital") continue;
      let best = 0;
      for (const n of near) best = Math.max(best, sa[n].roles[role].score);
      cov += best;
    }
    const nonCap = settings.targetRoles.filter((r) => r !== "Capital").length || 1;
    return { i, p: sa[i].roles.Capital.score * 0.6 + (cov / nonCap) * 0.4 };
  });
  pre.sort((a, b) => b.p - a.p);
  const capitals = pre.slice(0, settings.maxCapitals).map((x) => x.i);

  const results: CapitalResult[] = capitals.map((c) => ({
    capitalId64: sa[c].system.id64,
    bubbles: bestPerSize(c, ctx),
  }));

  return {
    systems: sa,
    capitals: results.filter((r) => r.bubbles.length > 0),
    stats: { candidates: claimIdx.length, capitalsEvaluated: capitals.length, ms: Date.now() - t0 },
  };
}
