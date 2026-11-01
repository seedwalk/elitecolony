"use client";

import { create } from "zustand";
import { loadRegion, type FrontierScan } from "@/lib/db";
import { marketSearchRange, type PlannerSettings, type RegionInput, type RegionResult, type SystemAnalysis } from "@/lib/engine/bubbles";
import type { Zone } from "@/lib/engine/frontier";
import { dist } from "@/lib/geo";
import { fetchRegion, scanFrontier, type FetchProgress } from "@/lib/region";
import { resolveSystem } from "@/lib/spansh/client";
import type { Station, Vec3 } from "@/lib/types";
import { useSettings, type SphereMeta } from "./settings";

interface AnalysisState {
  fetching: boolean;
  progress: FetchProgress | null;
  fetchError: string | null;
  analysing: boolean;
  analyseError: string | null;
  scan: FrontierScan | null;
  result: RegionResult | null;
  stations: Station[];
  byId: Map<number, SystemAnalysis>;
  unmatchedNames: string[];
  abort: AbortController | null;
  /** Frontier zones ticked for bulk analysis (anchor id64s). */
  selectedZones: Set<number>;
  toggleZone: (id: number) => void;
  setSelectedZones: (ids: number[]) => void;
  clearAnalysed: () => void;

  runScan: (force?: boolean) => Promise<void>;
  loadCachedScan: () => Promise<void>;
  /** Fetches the zones and ADDS them to the current set of analysed zones. */
  analyseZones: (zones: Pick<Zone, "anchorId64" | "name" | "x" | "y" | "z">[]) => Promise<void>;
  fetchCurrentForm: (force?: boolean) => Promise<void>;
  fetchAroundNames: (names: string[]) => Promise<void>;
  cancelFetch: () => void;
  analyse: () => Promise<void>;
}

let worker: Worker | null = null;
let reqId = 0;
function getWorker(): Worker {
  if (!worker) worker = new Worker(new URL("../lib/engine/worker.ts", import.meta.url), { type: "module" });
  return worker;
}
function runInWorker(input: RegionInput): Promise<RegionResult> {
  const id = ++reqId;
  const w = getWorker();
  return new Promise((resolve, reject) => {
    const onMsg = (e: MessageEvent<{ id: number; result?: RegionResult; error?: string }>) => {
      if (e.data.id !== id) return;
      w.removeEventListener("message", onMsg);
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data.result!);
    };
    w.addEventListener("message", onMsg);
    w.postMessage({ id, input });
  });
}

const STATION_EXTRA = (p: PlannerSettings["logistics"]) => marketSearchRange(p);
const fmtC = (c: Vec3) => `${c.x.toFixed(0)}, ${c.y.toFixed(0)}, ${c.z.toFixed(0)}`;

export const useAnalysis = create<AnalysisState>()((set, get) => {
  /** Fetches each sphere (cached ones are skipped), then makes them the current analysis region. */
  async function fetchSpheres(spheres: SphereMeta[], label: string, force = false) {
    const s = useSettings.getState();
    const ac = new AbortController();
    s.setSidebarOpen(false);
    set({ fetching: true, fetchError: null, abort: ac, progress: null });
    try {
      for (const [i, sp] of spheres.entries()) {
        const prefix = spheres.length > 1 ? `[${i + 1}/${spheres.length} ${sp.label}] ` : "";
        await fetchRegion({
          ref: { coords: sp.center },
          radius: sp.radius,
          stationExtra: STATION_EXTRA(s.planner.logistics),
          ttlDays: s.ttlDays,
          force,
          signal: ac.signal,
          onProgress: (p) => set({ progress: { ...p, message: prefix + p.message } }),
        });
      }
      s.setCurrentRegion({
        key: spheres.map((sp) => `${fmtC(sp.center)}@${sp.radius}`).join("|"),
        label,
        spheres,
        fetchedAt: Date.now(),
      });
      set({ fetching: false, abort: null });
      await get().analyse();
    } catch (e) {
      const msg = (e as Error).name === "AbortError" ? "Cancelled" : (e as Error).message;
      set({ fetching: false, fetchError: msg, abort: null });
    }
  }

  return {
    fetching: false,
    progress: null,
    fetchError: null,
    analysing: false,
    analyseError: null,
    scan: null,
    result: null,
    stations: [],
    byId: new Map(),
    unmatchedNames: [],
    abort: null,
    selectedZones: new Set(),
    toggleZone: (id) =>
      set((st) => {
        const next = new Set(st.selectedZones);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { selectedZones: next };
      }),
    setSelectedZones: (ids) => set({ selectedZones: new Set(ids) }),
    clearAnalysed: () => {
      useSettings.getState().setCurrentRegion(null);
      set({ result: null, byId: new Map(), stations: [] });
    },

    runScan: async (force = false) => {
      const s = useSettings.getState();
      const ac = new AbortController();
      s.setSidebarOpen(false);
      set({ fetching: true, fetchError: null, abort: ac, progress: null });
      try {
        const scan = await scanFrontier({
          sunMin: s.planner.sunMin,
          sunMax: s.planner.sunMax,
          ttlDays: s.ttlDays,
          force,
          signal: ac.signal,
          onProgress: (p) => set({ progress: p }),
        });
        set({ scan, fetching: false, abort: null });
      } catch (e) {
        const msg = (e as Error).name === "AbortError" ? "Cancelled" : (e as Error).message;
        set({ fetching: false, fetchError: msg, abort: null });
      }
    },

    loadCachedScan: async () => {
      const { planner } = useSettings.getState();
      const { db } = await import("@/lib/db");
      const scan = await db.scans.get(`sun:${planner.sunMin}-${planner.sunMax}`);
      set({ scan: scan ?? null });
    },

    analyseZones: async (zones) => {
      const { planner, currentRegion } = useSettings.getState();
      const radius = Math.ceil(planner.maxRadius + planner.maxHop);
      // Keep EVERYTHING analysed so far (zones, areas, searches) and add the new ones.
      const previous = currentRegion?.spheres ?? [];
      const known = new Set(previous.map((sp) => sp.anchorId64).filter((x) => x !== undefined));
      const sameCentre = (c: Vec3) => previous.some((sp) => dist(sp.center, c) < 1 && sp.radius >= radius);
      const added = zones
        .filter((z) => !known.has(z.anchorId64) && !sameCentre(z))
        .map((z) => ({ center: { x: z.x, y: z.y, z: z.z }, radius, label: z.name, anchorId64: z.anchorId64 }));
      const spheres = [...previous, ...added];
      if (spheres.length === 0) return;
      useSettings.getState().setCapitalFilterNames([]);
      await fetchSpheres(spheres, `${spheres.length} analysed area${spheres.length > 1 ? "s" : ""}`);
      set((st) => {
        const next = new Set(st.selectedZones);
        for (const z of zones) next.delete(z.anchorId64);
        return { selectedZones: next };
      });
    },

    fetchCurrentForm: async (force = false) => {
      const s = useSettings.getState();
      const f = s.regionForm;
      if (f.mode === "system" && !f.system) {
        set({ fetchError: "Pick a reference system from the list" });
        return;
      }
      const center = f.mode === "system" ? { x: f.system!.x, y: f.system!.y, z: f.system!.z } : f.coords;
      const label = f.mode === "system" ? f.system!.name : fmtC(f.coords);
      await fetchSpheres([{ center, radius: f.radius, label }], label, force);
    },

    fetchAroundNames: async (names) => {
      const s = useSettings.getState();
      set({ fetching: true, fetchError: null, progress: { phase: "resolve", fetched: 0, total: names.length, message: "Resolving systems…" } });
      try {
        const found: { name: string; x: number; y: number; z: number }[] = [];
        const missing: string[] = [];
        for (const [i, n] of names.entries()) {
          const r = await resolveSystem(n);
          if (r) found.push(r);
          else missing.push(n);
          set({ progress: { phase: "resolve", fetched: i + 1, total: names.length, message: `Resolving ${i + 1}/${names.length}` } });
        }
        if (found.length === 0) throw new Error("None of the systems were found on Spansh");
        const c = {
          x: found.reduce((a, b) => a + b.x, 0) / found.length,
          y: found.reduce((a, b) => a + b.y, 0) / found.length,
          z: found.reduce((a, b) => a + b.z, 0) / found.length,
        };
        const spread = Math.max(...found.map((f) => dist(c, f)));
        const radius = Math.min(120, Math.ceil(spread + s.planner.maxRadius));
        s.setCapitalFilterNames(found.map((f) => f.name));
        set({ fetching: false, unmatchedNames: missing });
        await fetchSpheres([{ center: c, radius, label: `${found.length} pasted systems` }], `${found.length} pasted systems`);
      } catch (e) {
        set({ fetching: false, fetchError: (e as Error).message });
      }
    },

    cancelFetch: () => get().abort?.abort(),

    analyse: async () => {
      const s = useSettings.getState();
      const region = s.currentRegion;
      if (!region) return;
      set({ analysing: true, analyseError: null });
      try {
        const data = await loadRegion(region.spheres, STATION_EXTRA(s.planner.logistics));
        const nameSet = new Set(s.capitalFilterNames.map((n) => n.toLowerCase()));
        const capitalFilter = nameSet.size
          ? data.systems.filter((x) => nameSet.has(x.name.toLowerCase())).map((x) => x.id64)
          : undefined;
        const settings: PlannerSettings = { ...s.planner, capitalFilter };
        const result = await runInWorker({ ...data, settings });
        const byId = new Map(result.systems.map((x) => [x.system.id64, x]));
        const unmatched = nameSet.size
          ? s.capitalFilterNames.filter((n) => !data.systems.some((x) => x.name.toLowerCase() === n.toLowerCase()))
          : [];
        set({ result, byId, stations: data.stations, analysing: false, unmatchedNames: unmatched });
      } catch (e) {
        set({ analysing: false, analyseError: (e as Error).message });
      }
    },
  };
});
