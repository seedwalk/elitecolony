import { db, regionKey, type FrontierScan } from "./db";
import { ANCHOR_SUBTYPES } from "./engine/frontier";
import { fetchShell, fetchSphere, resolveSystem, type Reference } from "./spansh/client";
import { normalizeBody, normalizeStation, normalizeSummaryBodies, normalizeSystem } from "./spansh/normalize";
import type { RegionQuery, Vec3 } from "./types";

export interface FetchProgress {
  phase: "resolve" | "scan" | "systems" | "bodies" | "stations" | "done" | "cached";
  fetched: number;
  total: number;
  message: string;
}

export interface FetchRegionOptions {
  ref: Reference;
  radius: number;
  /** Extra radius for logistics stations (haul distance). */
  stationExtra: number;
  ttlDays: number;
  force?: boolean;
  onProgress: (p: FetchProgress) => void;
  signal?: AbortSignal;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Fetches (or reuses from cache) every system, body and construction market in a sphere. */
export async function fetchRegion(opts: FetchRegionOptions): Promise<{ center: Vec3; centerName: string | null; query: RegionQuery }> {
  const { ref, radius, stationExtra, ttlDays, force, onProgress, signal } = opts;
  let center: Vec3;
  let centerName: string | null = null;
  if ("system" in ref) {
    onProgress({ phase: "resolve", fetched: 0, total: 1, message: `Resolving ${ref.system}…` });
    const r = await resolveSystem(ref.system, signal);
    if (!r) throw new Error(`System not found: ${ref.system}`);
    center = { x: r.x, y: r.y, z: r.z };
    centerName = r.name;
  } else {
    center = ref.coords;
  }

  const key = regionKey(center, radius);
  const cached = await db.regionQueries.get(key);
  if (!force && cached && cached.status === "done" && Date.now() - cached.fetchedAt < ttlDays * 864e5) {
    onProgress({ phase: "cached", fetched: cached.systemCount, total: cached.systemCount, message: "Using cached region" });
    return { center, centerName, query: cached };
  }

  const coordsRef: Reference = { coords: center };
  const now = Date.now();
  let systemCount = 0;
  let bodyCount = 0;
  let stationCount = 0;

  await fetchSphere<any>(
    "systems",
    coordsRef,
    radius,
    async (items, p) => {
      systemCount += items.length;
      await db.systems.bulkPut(items.map((r) => normalizeSystem(r, now)));
      onProgress({ phase: "systems", ...p, message: `Systems ${p.fetched}/${p.total}` });
    },
    {},
    signal,
  );

  await fetchSphere<any>(
    "bodies",
    coordsRef,
    radius,
    async (items, p) => {
      bodyCount += items.length;
      await db.bodies.bulkPut(items.map(normalizeBody));
      onProgress({ phase: "bodies", ...p, message: `Bodies ${p.fetched}/${p.total}` });
    },
    {},
    signal,
  );

  await fetchSphere<any>(
    "stations",
    coordsRef,
    radius + stationExtra,
    async (items, p) => {
      stationCount += items.length;
      await db.stations.bulkPut(items.map((r) => normalizeStation(r, now)));
      onProgress({ phase: "stations", ...p, message: `Construction markets ${p.fetched}/${p.total}` });
    },
    // Only stations that sell Steel: the main construction commodity.
    { market: [{ name: "Steel", supply: { value: ["1", "999999999"], comparison: "<=>" } }] },
    signal,
  );

  const query: RegionQuery = {
    key,
    center,
    centerName,
    radius,
    fetchedAt: now,
    systemCount,
    bodyCount,
    stationCount,
    status: "done",
  };
  await db.regionQueries.put(query);
  onProgress({ phase: "done", fetched: systemCount, total: systemCount, message: "Done" });
  return { center, centerName, query };
}

/**
 * Stage 1: downloads every *unpopulated* system in a distance-from-Sol band that has at least
 * one tourism-grade body (see ANCHOR_SUBTYPES), with its body summary. ~3.5k systems / 20 MB
 * for a 100 ly band at ~300 ly.
 */
export async function scanFrontier(opts: {
  sunMin: number;
  sunMax: number;
  ttlDays: number;
  force?: boolean;
  onProgress: (p: FetchProgress) => void;
  signal?: AbortSignal;
}): Promise<FrontierScan> {
  const { sunMin, sunMax, ttlDays, force, onProgress, signal } = opts;
  const key = `sun:${sunMin}-${sunMax}`;
  const cached = await db.scans.get(key);
  if (!force && cached && Date.now() - cached.fetchedAt < ttlDays * 864e5) {
    onProgress({ phase: "cached", fetched: cached.systems.length, total: cached.systems.length, message: "Using cached scan" });
    return cached;
  }
  const now = Date.now();
  const systems: FrontierScan["systems"] = [];
  await fetchShell<any>(
    "systems",
    { coords: { x: 0, y: 0, z: 0 } },
    sunMin,
    sunMax,
    (items, p) => {
      for (const r of items) systems.push({ system: normalizeSystem(r, now), bodies: normalizeSummaryBodies(r) });
      onProgress({ phase: "scan", ...p, message: `Frontier systems ${p.fetched}/${p.total}` });
    },
    {
      body_subtype: { value: ANCHOR_SUBTYPES },
      population: { value: ["0", "0"], comparison: "<=>" },
    },
    signal,
  );
  const scan: FrontierScan = { key, sunMin, sunMax, fetchedAt: now, systems };
  await db.scans.put(scan);
  onProgress({ phase: "done", fetched: systems.length, total: systems.length, message: "Scan done" });
  return scan;
}
