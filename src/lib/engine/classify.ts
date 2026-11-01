import type { Body } from "../types";

const sub = (b: Body) => (b.subtype ?? "").toLowerCase();

export const isELW = (b: Body) => sub(b) === "earth-like world";
export const isWW = (b: Body) => sub(b) === "water world";
export const isAW = (b: Body) => sub(b) === "ammonia world";
export const isHMC = (b: Body) => sub(b) === "high metal content world";
export const isMetalRich = (b: Body) => sub(b) === "metal-rich body" || sub(b) === "metal rich body";
export const isRocky = (b: Body) => sub(b) === "rocky body";
export const isRockyIce = (b: Body) => sub(b) === "rocky ice world";
export const isIcy = (b: Body) => sub(b) === "icy body";
export const isGasGiant = (b: Body) => sub(b).includes("gas giant");
export const isStar = (b: Body) => b.type === "Star";
export const isBlackHole = (b: Body) => isStar(b) && sub(b).includes("black hole");
export const isNeutron = (b: Body) => isStar(b) && sub(b).includes("neutron");
export const isWhiteDwarf = (b: Body) => isStar(b) && sub(b).startsWith("white dwarf");
export const isCompactStar = (b: Body) => isBlackHole(b) || isNeutron(b) || isWhiteDwarf(b);
export const isBrownDwarf = (b: Body) => isStar(b) && sub(b).includes("brown dwarf");
export const isMainSequence = (b: Body) =>
  isStar(b) && /^[obafgkm] \(/.test(sub(b)) && !isCompactStar(b);
export const isTerraformable = (b: Body) =>
  (b.terraformingState ?? "").toLowerCase().startsWith("candidate") ||
  (b.terraformingState ?? "").toLowerCase() === "terraformable";
export const hasRings = (b: Body) => b.rings.length > 0 || b.hasBelts;
export const isPlain = (b: Body) => !hasRings(b) && b.bioSignals === 0 && b.geoSignals === 0;

export function hotspotTotal(b: Body): number {
  let n = 0;
  for (const r of b.rings) for (const c of Object.values(r.hotspots)) n += c;
  return n;
}

export function systemReserve(bodies: Body[]): string | null {
  for (const b of bodies) if (b.reserveLevel) return b.reserveLevel;
  return null;
}

/** Odyssey allows on-foot on every landable body; "walkable" is kept as a separate count for parity with ED Colonise. */
export const isWalkable = (b: Body) => b.isLandable;

export interface SystemFacts {
  bodyCount: number;
  scannedBodies: number;
  landable: number;
  elw: number;
  ww: number;
  aw: number;
  hmc: number;
  metalRich: number;
  rocky: number;
  rockyIce: number;
  icy: number;
  gasGiants: number;
  terraformable: number;
  ringedBodies: number;
  hotspots: number;
  hotspotTypes: Record<string, number>;
  bio: number;
  geo: number;
  volcanicLandables: number;
  blackHoles: number;
  neutronStars: number;
  whiteDwarfs: number;
  stars: number;
  mainStar: string | null;
  reserve: string | null;
}

export function systemFacts(bodies: Body[], declaredBodyCount: number | null): SystemFacts {
  const f: SystemFacts = {
    bodyCount: declaredBodyCount ?? bodies.length,
    scannedBodies: bodies.length,
    landable: 0,
    elw: 0,
    ww: 0,
    aw: 0,
    hmc: 0,
    metalRich: 0,
    rocky: 0,
    rockyIce: 0,
    icy: 0,
    gasGiants: 0,
    terraformable: 0,
    ringedBodies: 0,
    hotspots: 0,
    hotspotTypes: {},
    bio: 0,
    geo: 0,
    volcanicLandables: 0,
    blackHoles: 0,
    neutronStars: 0,
    whiteDwarfs: 0,
    stars: 0,
    mainStar: null,
    reserve: systemReserve(bodies),
  };
  for (const b of bodies) {
    if (b.isLandable) f.landable++;
    if (isELW(b)) f.elw++;
    if (isWW(b)) f.ww++;
    if (isAW(b)) f.aw++;
    if (isHMC(b)) f.hmc++;
    if (isMetalRich(b)) f.metalRich++;
    if (isRocky(b)) f.rocky++;
    if (isRockyIce(b)) f.rockyIce++;
    if (isIcy(b)) f.icy++;
    if (isGasGiant(b)) f.gasGiants++;
    if (isTerraformable(b)) f.terraformable++;
    if (b.rings.length > 0) f.ringedBodies++;
    for (const r of b.rings)
      for (const [k, v] of Object.entries(r.hotspots)) {
        f.hotspots += v;
        f.hotspotTypes[k] = (f.hotspotTypes[k] ?? 0) + v;
      }
    if (b.bioSignals > 0) f.bio++;
    if (b.geoSignals > 0) f.geo++;
    if (b.isLandable && b.volcanism && !/no volcanism/i.test(b.volcanism)) f.volcanicLandables++;
    if (isStar(b)) f.stars++;
    if (isBlackHole(b)) f.blackHoles++;
    if (isNeutron(b)) f.neutronStars++;
    if (isWhiteDwarf(b)) f.whiteDwarfs++;
    if (b.isMainStar) f.mainStar = b.subtype;
  }
  return f;
}
