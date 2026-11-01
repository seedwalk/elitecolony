import type { Body, Certainty, Reason, Role, RoleScore, RoleScores } from "../types";
import {
  hasRings,
  isBrownDwarf,
  isGasGiant,
  isIcy,
  isMainSequence,
  isPlain,
  isRocky,
  isRockyIce,
  isStar,
  type SystemFacts,
} from "./classify";

/** Minimum role score for a role to count as "covered" by a system. */
export const ROLE_COVER_THRESHOLD = 40;

class Acc {
  reasons: Reason[] = [];
  add(text: string, count: number, perItem: number, cap: number, certainty: Certainty = "estimated") {
    if (count <= 0) return;
    const points = Math.min(cap, count * perItem);
    if (points !== 0) this.reasons.push({ text: `${text} ×${count}`, points, certainty });
  }
  flat(text: string, points: number, certainty: Certainty = "estimated") {
    if (points !== 0) this.reasons.push({ text, points, certainty });
  }
  result(): RoleScore {
    const raw = this.reasons.reduce((s, r) => s + r.points, 0);
    return { score: Math.max(0, Math.min(100, Math.round(raw))), reasons: this.reasons };
  }
}

function reserveBonus(acc: Acc, reserve: string | null, scale: number) {
  const r = (reserve ?? "").toLowerCase();
  if (r === "pristine") acc.flat("Pristine reserve", 20 * scale, "confirmed");
  else if (r === "major") acc.flat("Major reserve", 12 * scale, "confirmed");
  else if (r === "common") acc.flat("Common reserve", 4 * scale, "confirmed");
  else if (r === "low") acc.flat("Low reserve", -8 * scale, "confirmed");
  else if (r === "depleted") acc.flat("Depleted reserve", -15 * scale, "confirmed");
  else acc.flat("Reserve unknown", 0, "verify-in-game");
}

export interface LogisticsInput {
  /** Distance (ly) from this system to the nearest usable construction market, or null if none found. */
  nearestMarketLy: number | null;
  maxHaulLy: number;
}

/**
 * Scores how well a system fits each role, based on the colony-port economy
 * inheritance rules (see docs/colonization-rules.md). Rule-derived points are `estimated`.
 */
export function scoreRoles(bodies: Body[], f: SystemFacts, logistics: LogisticsInput): RoleScores {
  const plainRocky = bodies.filter((b) => isRocky(b) && isPlain(b)).length;
  const plainIcy = bodies.filter((b) => isIcy(b) && isPlain(b)).length;
  const plainRockyIce = bodies.filter((b) => isRockyIce(b) && isPlain(b)).length;
  const gg = bodies.filter(isGasGiant).length;
  const compact = f.blackHoles + f.neutronStars + f.whiteDwarfs;
  const mainStar = bodies.find((b) => b.isMainStar) ?? bodies.find(isStar);
  const militaryStars = bodies.filter(
    (b) => (isMainSequence(b) || isBrownDwarf(b)) && !hasRings(b),
  ).length;
  const bioNotLocked = bodies.filter((b) => b.bioSignals > 0 && !b.tidallyLocked && !isIcy(b)).length;

  // Capital (Tourism)
  const cap = new Acc();
  cap.add("Earth-like world", f.elw, 35, 50);
  cap.add("Water world", f.ww, 18, 36);
  cap.add("Ammonia world", f.aw, 18, 30);
  cap.add("Black hole / neutron / white dwarf", compact, 25, 30);
  cap.add("Bodies with organics", f.bio, 3, 15);
  cap.add("Bodies with geologicals", f.geo, 2, 10);
  cap.add("Landable bodies (surface slots)", f.landable, 1, 10, "confirmed");

  // Extraction
  const ext = new Acc();
  ext.add("HMC / metal-rich bodies", f.hmc + f.metalRich, 4, 20);
  ext.add("Ringed bodies", f.ringedBodies, 6, 24);
  ext.add("Ring hotspots", f.hotspots, 1.5, 30, "confirmed");
  ext.add("Landables with volcanism", f.volcanicLandables, 2, 10);
  reserveBonus(ext, f.reserve, 1);

  // Refinery
  const ref = new Acc();
  ref.add("Rocky bodies (no rings/organics/geo)", plainRocky, 5, 40);
  ref.add("Rocky ice bodies", plainRockyIce, 3, 15);
  ref.add("Landable bodies (Refinery Hub is ground-only)", f.landable, 1, 20, "confirmed");
  reserveBonus(ref, f.reserve, 0.75);

  // Industrial
  const ind = new Acc();
  ind.add("Icy bodies (no rings/organics/geo)", plainIcy, 4, 30);
  ind.add("Rocky ice bodies", plainRockyIce, 4, 20);
  ind.add("Gas giants", gg, 5, 20);
  ind.add("Bodies with geologicals", f.geo, 2, 10);
  reserveBonus(ind, f.reserve, 0.5);

  // Agriculture
  const agr = new Acc();
  agr.add("Earth-like world", f.elw, 35, 50);
  agr.add("Water world", f.ww, 25, 40);
  agr.add("Terraformable bodies", f.terraformable, 6, 24);
  agr.add("Organics (not icy, not tidally locked)", bioNotLocked, 4, 20);

  // High Tech
  const ht = new Acc();
  ht.add("Ammonia world", f.aw, 30, 45);
  ht.add("Earth-like world", f.elw, 20, 30);
  ht.add("Water world", f.ww, 12, 24);
  ht.add("Black hole / neutron / white dwarf", compact, 25, 30);
  ht.add("Gas giants", gg, 3, 15);
  ht.add("Bodies with geologicals", f.geo, 2, 10);
  ht.add("Bodies with organics", f.bio, 2, 10);

  // Military
  const mil = new Acc();
  if (mainStar && (isMainSequence(mainStar) || isBrownDwarf(mainStar)) && !hasRings(mainStar))
    mil.flat("Main-sequence / brown dwarf primary without belts", 45);
  mil.add("Other beltless main-sequence / brown dwarf stars", Math.max(0, militaryStars - 1), 12, 30);
  mil.add("Landable bodies", f.landable, 1, 15, "confirmed");

  // Logistics: proximity to construction markets (not an economy)
  const log = new Acc();
  if (logistics.nearestMarketLy === null) {
    log.flat("No construction market found in range", 0, "verify-in-game");
  } else {
    const d = logistics.nearestMarketLy;
    const p = Math.max(0, 1 - d / Math.max(1, logistics.maxHaulLy)) * 70;
    log.flat(`Nearest construction market ${d.toFixed(1)} ly`, Math.round(p), "confirmed");
  }
  log.add("Landable bodies", f.landable, 1, 15, "confirmed");
  log.add("Stars (fuel scooping / slots)", f.stars, 5, 15, "confirmed");

  const out: Record<Role, RoleScore> = {
    Capital: cap.result(),
    Extraction: ext.result(),
    Refinery: ref.result(),
    Industrial: ind.result(),
    Agriculture: agr.result(),
    HighTech: ht.result(),
    Military: mil.result(),
    Logistics: log.result(),
  };
  return out;
}
