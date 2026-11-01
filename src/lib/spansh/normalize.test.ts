import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeBody, normalizeStation, normalizeSystem } from "./normalize";

const sample = (f: string) =>
  JSON.parse(readFileSync(path.join(__dirname, "../../../docs/samples", f), "utf8"));

describe("Spansh normalizers (real samples)", () => {
  it("normalizes systems search results", () => {
    const raw = sample("spansh-systems-search.json");
    const systems = raw.results.map((r: object) => normalizeSystem(r, 1));
    expect(systems.length).toBeGreaterThan(0);
    const s = systems[0];
    expect(typeof s.id64).toBe("number");
    expect(Number.isFinite(s.x)).toBe(true);
    expect(s.source).toBe("spansh");
    expect(s.isColonised).toBe(false);
  });

  it("detects colonised systems and factions", () => {
    const raw = sample("spansh-systems-search-colonised.json");
    const s = normalizeSystem(raw.results[0], 1);
    expect(s.isColonised).toBe(true);
    expect(s.controllingFaction).toBe("Canonn");
    expect(s.population).toBeGreaterThan(0);
  });

  it("normalizes bodies with rings, hotspots and signals", () => {
    const raw = sample("spansh-bodies-search.json");
    const bodies = raw.results.map(normalizeBody);
    const ringed = bodies.find((b: { rings: { hotspots: object }[] }) =>
      b.rings.some((r) => Object.keys(r.hotspots).length > 0),
    );
    expect(ringed).toBeDefined();
    expect(ringed.rings[0].type).toBeTruthy();
    expect(bodies.some((b: { isLandable: boolean }) => b.isLandable)).toBe(true);
    expect(bodies.some((b: { geoSignals: number }) => b.geoSignals > 0)).toBe(true);
    expect(bodies.some((b: { reserveLevel: string | null }) => b.reserveLevel === "Pristine")).toBe(true);
    const moon = bodies.find((b: { parentType: string | null }) => b.parentType === "Planet");
    if (moon) expect(moon.parentId64).not.toBeNull();
  });

  it("extracts construction commodities from station markets", () => {
    const raw = sample("spansh-stations-search.json");
    const stations = raw.results.map((r: object) => normalizeStation(r, 1));
    expect(stations.some((s: { largePads: number }) => s.largePads > 0)).toBe(true);
    const withStock = stations.filter(
      (s: { constructionStock: object }) => Object.keys(s.constructionStock).length > 0,
    );
    expect(withStock.length).toBeGreaterThan(0);
  });
});
