import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeSummaryBodies, normalizeSystem } from "../spansh/normalize";
import type { StarSystem } from "../types";
import { DEFAULT_SETTINGS, locationScore } from "./bubbles";
import { pickDistinctZones, rankZones, scoreZones, type ScanSystem } from "./frontier";

const W = { expansion: 6, capital: 5, build: 4, independence: 3, diversity: 2, location: 2 };

function sys(id64: number, name: string, x: number, y: number, z: number, extra: Partial<StarSystem> = {}): StarSystem {
  return {
    id64, name, x, y, z, population: 0, isColonised: false, isBeingColonised: false, needsPermit: false,
    nearestPopulatedDistance: 10, controllingFaction: null, primaryEconomy: null, secondaryEconomy: null,
    bodyCount: null, updatedAt: null, source: "spansh", fetchedAt: 0, ...extra,
  };
}
const summary = (id64: number, ...subtypes: string[]) =>
  normalizeSummaryBodies({ id64, bodies: subtypes.map((st, i) => ({ id64: id64 * 100 + i, name: `b${i}`, subtype: st, type: /star|hole/i.test(st) ? "Star" : "Planet" })) });

describe("locationScore", () => {
  it("prefers outer / inner / neutral within the band", () => {
    expect(locationScore(350, 250, 350, "outer").score).toBe(100);
    expect(locationScore(250, 250, 350, "outer").score).toBe(0);
    expect(locationScore(250, 250, 350, "inner").score).toBe(100);
    expect(locationScore(300, 250, 350, "neutral").score).toBe(50);
    expect(locationScore(999, 250, 350, "outer").score).toBe(100); // clamped
  });
});

describe("scoreZones", () => {
  const scan: ScanSystem[] = [
    { system: sys(1, "Garden", 300, 0, 0, { nearestPopulatedDistance: 12 }), bodies: summary(1, "Earth-like world", "Water world", "K (Yellow-Orange) Star") },
    { system: sys(2, "Neighbour", 310, 0, 0), bodies: summary(2, "Water world", "Icy body", "Icy body", "Icy body", "Class I gas giant") },
    { system: sys(3, "Far", 340, 0, 120, { nearestPopulatedDistance: 40 }), bodies: summary(3, "Ammonia world") },
    { system: sys(4, "Claimed", 305, 0, 0, { isBeingColonised: true }), bodies: summary(4, "Earth-like world") },
  ];
  const settings = { ...DEFAULT_SETTINGS, sunMin: 250, sunMax: 350, sunPreference: "outer" as const };

  it("skips non-claimable systems and counts neighbours", () => {
    const zones = scoreZones(scan, settings);
    expect(zones.map((z) => z.name)).not.toContain("Claimed");
    const g = zones.find((z) => z.name === "Garden")!;
    expect(g.neighbours).toBe(1);
    expect(g.bridgeHops).toBe(0);
    expect(g.criteria.capital.score).toBeGreaterThan(50);
  });

  it("flags bridge requirements from nearest populated distance", () => {
    const far = scoreZones(scan, settings).find((z) => z.name === "Far")!;
    expect(far.bridgeHops).toBe(2);
    expect(far.notes.join()).toMatch(/bridge/);
  });

  it("location preference changes the ranking", () => {
    const zones = scoreZones(scan, settings);
    const outer = rankZones(zones, { ...W, expansion: 0, capital: 0, build: 0, independence: 0, diversity: 0, location: 10 });
    expect(outer[0].zone.name).toBe("Far");
    const innerZones = scoreZones(scan, { ...settings, sunPreference: "inner" });
    const inner = rankZones(innerZones, { ...W, expansion: 0, capital: 0, build: 0, independence: 0, diversity: 0, location: 10 });
    expect(inner[0].zone.name).toBe("Garden");
  });

  it("picks distinct zones far enough apart", () => {
    const ranked = rankZones(scoreZones(scan, settings), W);
    const picks = pickDistinctZones(ranked, 5, 50);
    for (let i = 0; i < picks.length; i++)
      for (let j = i + 1; j < picks.length; j++) {
        const a = picks[i].zone;
        const b = picks[j].zone;
        expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeGreaterThanOrEqual(50);
      }
  });

  it("normalizes real systems-search body summaries", () => {
    const raw = JSON.parse(readFileSync(path.join(__dirname, "../../../docs/samples/spansh-systems-search.json"), "utf8"));
    const bodies = normalizeSummaryBodies(raw.results[0]);
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies[0].systemId64).toBe(normalizeSystem(raw.results[0], 0).id64);
    expect(bodies.some((b) => b.isMainStar)).toBe(true);
  });
});
