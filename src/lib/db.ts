import Dexie, { type EntityTable } from "dexie";
import { dist } from "./geo";
import type { ScanSystem } from "./engine/frontier";
import type { Body, RegionQuery, StarSystem, Station, Vec3 } from "./types";

export interface FrontierScan {
  key: string;
  sunMin: number;
  sunMax: number;
  fetchedAt: number;
  systems: ScanSystem[];
}

class PlannerDB extends Dexie {
  systems!: EntityTable<StarSystem, "id64">;
  bodies!: EntityTable<Body, "id64">;
  stations!: EntityTable<Station, "id">;
  regionQueries!: EntityTable<RegionQuery, "key">;
  scans!: EntityTable<FrontierScan, "key">;

  constructor() {
    super("ed-bubbleplanner");
    this.version(1).stores({
      systems: "id64, name, x, fetchedAt",
      bodies: "id64, systemId64",
      stations: "id, systemId64, x",
      regionQueries: "key, fetchedAt",
    });
    this.version(2).stores({ scans: "key, fetchedAt" });
  }
}

export const db = new PlannerDB();

export function regionKey(center: Vec3, radius: number): string {
  return `${center.x.toFixed(2)},${center.y.toFixed(2)},${center.z.toFixed(2)}@${radius}`;
}

export interface RegionData {
  systems: StarSystem[];
  bodies: Body[];
  stations: Station[];
}

export interface Sphere {
  center: Vec3;
  radius: number;
}

/** Loads everything cached inside one or more spheres (deduplicated), plus stations within radius + extra. */
export async function loadRegion(spheres: Sphere[], stationExtra: number): Promise<RegionData> {
  const systems = new Map<number, StarSystem>();
  const stations = new Map<number, Station>();
  for (const { center, radius } of spheres) {
    const sys = await db.systems.where("x").between(center.x - radius, center.x + radius, true, true).toArray();
    for (const s of sys) if (dist(s, center) <= radius) systems.set(s.id64, s);
    const sr = radius + stationExtra;
    const st = await db.stations.where("x").between(center.x - sr, center.x + sr, true, true).toArray();
    for (const s of st) if (dist(s, center) <= sr) stations.set(s.id, s);
  }
  const ids = [...systems.keys()];
  const bodies = await db.bodies.where("systemId64").anyOf(ids).toArray();
  return { systems: [...systems.values()], bodies, stations: [...stations.values()] };
}

export async function clearCache() {
  await Promise.all([db.systems.clear(), db.bodies.clear(), db.stations.clear(), db.regionQueries.clear(), db.scans.clear()]);
}
