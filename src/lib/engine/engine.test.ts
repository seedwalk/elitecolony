import { describe, expect, it } from "vitest";
import type { Body, StarSystem, Station } from "../types";
import { analyseRegion, DEFAULT_SETTINGS, type PlannerSettings } from "./bubbles";
import { systemFacts } from "./classify";
import { scoreRoles } from "./roles";
import { normalizeWeights, rankCapitals, weightedScore } from "./scoring";

let nextId = 1;
function sys(name: string, x: number, y: number, z: number, extra: Partial<StarSystem> = {}): StarSystem {
  return {
    id64: nextId++,
    name,
    x,
    y,
    z,
    population: 0,
    isColonised: false,
    isBeingColonised: false,
    needsPermit: false,
    nearestPopulatedDistance: 20,
    controllingFaction: null,
    primaryEconomy: null,
    secondaryEconomy: null,
    bodyCount: null,
    updatedAt: null,
    source: "spansh",
    fetchedAt: 0,
    ...extra,
  };
}
function body(systemId64: number, subtype: string, extra: Partial<Body> = {}): Body {
  return {
    id64: nextId++,
    systemId64,
    name: subtype,
    type: /star/i.test(subtype) ? "Star" : "Planet",
    subtype,
    isMainStar: false,
    isLandable: false,
    gravity: null,
    atmosphere: null,
    volcanism: null,
    terraformingState: null,
    distanceToArrival: null,
    parentId64: null,
    parentType: null,
    tidallyLocked: false,
    bioSignals: 0,
    geoSignals: 0,
    rings: [],
    hasBelts: false,
    reserveLevel: null,
    updatedAt: null,
    ...extra,
  };
}
const many = (n: number, f: () => Body) => Array.from({ length: n }, f);

describe("normalizeWeights", () => {
  it("normalizes independent sliders to 100%", () => {
    const p = normalizeWeights({ expansion: 6, capital: 5, build: 4, independence: 3, diversity: 2, location: 0 });
    expect(Object.values(p).reduce((a, b) => a + b, 0)).toBeCloseTo(100);
    expect(p.expansion).toBeCloseTo(30);
    expect(p.diversity).toBeCloseTo(10);
  });
  it("splits equally when all zero", () => {
    const p = normalizeWeights({ expansion: 0, capital: 0, build: 0, independence: 0, diversity: 0, location: 0 });
    expect(p.capital).toBeCloseTo(100 / 6);
  });
  it("moving one slider does not change the others' raw values", () => {
    const w = { expansion: 5, capital: 5, build: 5, independence: 5, diversity: 5, location: 5 };
    const w2 = { ...w, capital: 10 };
    expect(normalizeWeights(w2).capital).toBeGreaterThan(normalizeWeights(w).capital);
    expect(w2.build).toBe(5);
  });
});

describe("scoreRoles", () => {
  it("gives tourism to ELW/WW/compact stars and extraction to rings+hotspots+pristine", () => {
    const tour = [body(1, "Earth-like world"), body(1, "Water world"), body(1, "Neutron Star")];
    const r1 = scoreRoles(tour, systemFacts(tour, null), { nearestMarketLy: null, maxHaulLy: 40 });
    expect(r1.Capital.score).toBeGreaterThanOrEqual(70);
    expect(r1.Agriculture.score).toBeGreaterThan(50);

    const mine = [
      body(2, "K (Yellow-Orange) Star", { isMainStar: true, reserveLevel: "Pristine" }),
      body(2, "High metal content world", {
        rings: [{ name: "A Ring", type: "Metallic", hotspots: { Platinum: 3, Painite: 2 } }],
      }),
      body(2, "Class III gas giant", { rings: [{ name: "B", type: "Icy", hotspots: { Tritium: 2 } }] }),
    ];
    const r2 = scoreRoles(mine, systemFacts(mine, null), { nearestMarketLy: null, maxHaulLy: 40 });
    expect(r2.Extraction.score).toBeGreaterThanOrEqual(40);
    expect(r2.Capital.score).toBeLessThan(20);
    expect(r2.Extraction.reasons.some((r) => r.text.startsWith("Pristine"))).toBe(true);
  });

  it("scores logistics by market distance", () => {
    const b = [body(3, "Rocky body")];
    const near = scoreRoles(b, systemFacts(b, null), { nearestMarketLy: 5, maxHaulLy: 40 });
    const far = scoreRoles(b, systemFacts(b, null), { nearestMarketLy: 39, maxHaulLy: 40 });
    expect(near.Logistics.score).toBeGreaterThan(far.Logistics.score);
  });
});

describe("analyseRegion / bubble search", () => {
  function scenario() {
    nextId = 1000;
    const bubble = sys("Populated Hub", 0, 0, 0, { population: 1e6, nearestPopulatedDistance: 0 });
    const capital = sys("Capital Candidate", 12, 0, 0);
    const miner = sys("Miner", 22, 0, 0);
    const farm = sys("Farm", 12, 10, 0);
    const refinery = sys("Rockpile", 12, 0, 11);
    const far = sys("Far Away", 200, 0, 0);
    const systems = [bubble, capital, miner, farm, refinery, far];
    const bodies: Body[] = [
      body(capital.id64, "Earth-like world"),
      body(capital.id64, "Ammonia world"),
      body(capital.id64, "Black Hole"),
      body(miner.id64, "M (Red dwarf) Star", { isMainStar: true, reserveLevel: "Pristine" }),
      ...many(4, () =>
        body(miner.id64, "High metal content world", {
          rings: [{ name: "r", type: "Metallic", hotspots: { Platinum: 4 } }],
        }),
      ),
      body(farm.id64, "Water world", { bioSignals: 2 }),
      body(farm.id64, "Earth-like world", { bioSignals: 3 }),
      body(refinery.id64, "G (White-Yellow) Star", { isMainStar: true, reserveLevel: "Major" }),
      ...many(8, () => body(refinery.id64, "Rocky body", { isLandable: true })),
      ...many(4, () => body(refinery.id64, "Icy body")),
      ...many(2, () => body(refinery.id64, "Class I gas giant")),
    ];
    const stations: Station[] = [
      {
        id: 1,
        systemId64: bubble.id64,
        systemName: bubble.name,
        x: 0,
        y: 0,
        z: 0,
        name: "Supply Port",
        type: "Coriolis Starport",
        largePads: 4,
        mediumPads: 4,
        isPlanetary: false,
        distanceToArrival: 100,
        systemIsColonised: false,
        constructionStock: { Steel: 5000, Aluminium: 3000 },
        marketUpdatedAt: null,
        fetchedAt: 0,
      },
    ];
    return { systems, bodies, stations, capital, miner, farm, refinery, far };
  }

  const settings: PlannerSettings = {
    ...DEFAULT_SETTINGS,
    targetRoles: ["Capital", "Extraction", "Agriculture", "Refinery"],
    sizeMin: 1,
    sizeMax: 5,
  };

  it("finds a bubble covering all roles with the right members", () => {
    const s = scenario();
    const res = analyseRegion({ systems: s.systems, bodies: s.bodies, stations: s.stations, settings });
    const cap = res.capitals.find((c) => c.capitalId64 === s.capital.id64);
    expect(cap).toBeDefined();
    const full = cap!.bubbles.find((b) => b.uncovered.length === 0);
    expect(full).toBeDefined();
    expect(full!.members[0]).toBe(s.capital.id64);
    expect(full!.members).toContain(s.miner.id64);
    expect(full!.members).not.toContain(s.far.id64);
    expect(full!.assignment[s.capital.id64]).toContain("Capital");
    expect(full!.assignment[s.miner.id64]).toContain("Extraction");
    expect(full!.maxHop).toBeLessThanOrEqual(settings.maxHop);
  });

  it("never includes populated systems as members and reports one bubble per size", () => {
    const s = scenario();
    const res = analyseRegion({ systems: s.systems, bodies: s.bodies, stations: s.stations, settings });
    for (const c of res.capitals) {
      const sizes = c.bubbles.map((b) => b.size);
      expect(new Set(sizes).size).toBe(sizes.length);
      for (const b of c.bubbles) expect(b.members).not.toContain(s.systems[0].id64);
    }
  });

  it("flags capitals beyond claim range as needing a bridge", () => {
    const s = scenario();
    const res = analyseRegion({ systems: s.systems, bodies: s.bodies, stations: s.stations, settings: { ...settings, capitalFilter: [s.far.id64] } });
    const b = res.capitals[0].bubbles[0];
    expect(b.bridgeHops).toBeGreaterThan(0);
    expect(b.risks.some((r) => r.includes("bridge"))).toBe(true);
  });

  it("ranking is deterministic and weights change the order coherently", () => {
    const s = scenario();
    const res = analyseRegion({ systems: s.systems, bodies: s.bodies, stations: s.stations, settings });
    const w = { expansion: 6, capital: 5, build: 4, independence: 3, diversity: 2, location: 0 };
    const a = rankCapitals(res.capitals, w);
    const b = rankCapitals(res.capitals, w);
    expect(a.map((x) => x.capitalId64)).toEqual(b.map((x) => x.capitalId64));
    const top = a[0];
    expect(top.recommendedScore).toBe(weightedScore(top.recommended, w));
    // recommended size is the smallest within tolerance of the best
    const best = Math.max(...top.curve.map((c) => c.score));
    expect(top.recommendedScore).toBeGreaterThanOrEqual(best - 3);
  });
});
