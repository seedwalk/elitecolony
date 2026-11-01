"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_SETTINGS, type PlannerSettings } from "@/lib/engine/bubbles";
import { BUILTIN_PROFILES, type WeightProfile, type Weights } from "@/lib/engine/scoring";
import type { Role, Vec3 } from "@/lib/types";

export interface SelectedSystem extends Vec3 {
  id64: number;
  name: string;
}

export interface RegionForm {
  mode: "frontier" | "system" | "coords";
  /** System picked from the autocomplete (free text is not accepted). */
  system: SelectedSystem | null;
  coords: Vec3;
  radius: number;
}

export interface SphereMeta {
  center: Vec3;
  radius: number;
  label: string;
}

/** What the bubble analysis currently runs on: one or more fetched spheres. */
export interface RegionMeta {
  key: string;
  label: string;
  spheres: SphereMeta[];
  fetchedAt: number;
}

interface SettingsState {
  weights: Weights;
  activeProfile: string | null;
  customProfiles: WeightProfile[];
  planner: Omit<PlannerSettings, "capitalFilter">;
  capitalFilterNames: string[];
  ttlDays: number;
  regionForm: RegionForm;
  currentRegion: RegionMeta | null;
  regionHistory: RegionMeta[];
  notes: Record<number, string>;
  assignedRoles: Record<number, Role[]>;
  verified: Record<number, boolean>;

  setWeight: (k: keyof Weights, v: number) => void;
  applyProfile: (name: string) => void;
  saveProfile: (name: string) => void;
  deleteProfile: (name: string) => void;
  setPlanner: (p: Partial<SettingsState["planner"]>) => void;
  setLogistics: (p: Partial<PlannerSettings["logistics"]>) => void;
  setCapitalFilterNames: (names: string[]) => void;
  setTtlDays: (d: number) => void;
  setRegionForm: (p: Partial<RegionForm>) => void;
  setCurrentRegion: (r: RegionMeta | null) => void;
  setNote: (id: number, note: string) => void;
  setAssignedRoles: (id: number, roles: Role[]) => void;
  setVerified: (id: number, v: boolean) => void;
  importState: (json: unknown) => void;
}

const allProfiles = (custom: WeightProfile[]) => [...BUILTIN_PROFILES, ...custom];

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      weights: { ...BUILTIN_PROFILES[0].weights },
      activeProfile: BUILTIN_PROFILES[0].name,
      customProfiles: [],
      planner: { ...DEFAULT_SETTINGS },
      capitalFilterNames: [],
      ttlDays: 7,
      regionForm: { mode: "frontier", system: null, coords: { x: 0, y: 0, z: 0 }, radius: 40 },
      currentRegion: null,
      regionHistory: [],
      notes: {},
      assignedRoles: {},
      verified: {},

      setWeight: (k, v) => set((s) => ({ weights: { ...s.weights, [k]: v }, activeProfile: null })),
      applyProfile: (name) => {
        const p = allProfiles(get().customProfiles).find((x) => x.name === name);
        if (p) set({ weights: { ...p.weights }, activeProfile: p.name });
      },
      saveProfile: (name) =>
        set((s) => ({
          customProfiles: [...s.customProfiles.filter((p) => p.name !== name), { name, weights: { ...s.weights } }],
          activeProfile: name,
        })),
      deleteProfile: (name) =>
        set((s) => ({
          customProfiles: s.customProfiles.filter((p) => p.name !== name),
          activeProfile: s.activeProfile === name ? null : s.activeProfile,
        })),
      setPlanner: (p) => set((s) => ({ planner: { ...s.planner, ...p } })),
      setLogistics: (p) => set((s) => ({ planner: { ...s.planner, logistics: { ...s.planner.logistics, ...p } } })),
      setCapitalFilterNames: (names) => set({ capitalFilterNames: names }),
      setTtlDays: (d) => set({ ttlDays: d }),
      setRegionForm: (p) => set((s) => ({ regionForm: { ...s.regionForm, ...p } })),
      setCurrentRegion: (r) =>
        set((s) => ({
          currentRegion: r,
          regionHistory: r ? [r, ...s.regionHistory.filter((h) => h.key !== r.key)].slice(0, 20) : s.regionHistory,
        })),
      setNote: (id, note) => set((s) => ({ notes: { ...s.notes, [id]: note } })),
      setAssignedRoles: (id, roles) => set((s) => ({ assignedRoles: { ...s.assignedRoles, [id]: roles } })),
      setVerified: (id, v) => set((s) => ({ verified: { ...s.verified, [id]: v } })),
      importState: (json) => {
        if (!json || typeof json !== "object") throw new Error("Invalid backup file");
        const j = json as Partial<SettingsState>;
        set((s) => ({
          weights: j.weights ?? s.weights,
          customProfiles: j.customProfiles ?? s.customProfiles,
          planner: j.planner ? { ...s.planner, ...j.planner } : s.planner,
          notes: j.notes ?? s.notes,
          assignedRoles: j.assignedRoles ?? s.assignedRoles,
          verified: j.verified ?? s.verified,
        }));
      },
    }),
    {
      name: "ed-bubbleplanner-settings",
      version: 2,
      // v1 → v2: new Location criterion, sun band, frontier mode, multi-sphere regions.
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        if (version < 2) {
          return { ...p, currentRegion: null, regionHistory: [], regionForm: undefined } as unknown as SettingsState;
        }
        return p as SettingsState;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          ...p,
          weights: { ...current.weights, ...(p.weights ?? {}) },
          planner: { ...current.planner, ...(p.planner ?? {}), logistics: { ...current.planner.logistics, ...(p.planner?.logistics ?? {}) } },
          regionForm: { ...current.regionForm, ...(p.regionForm ?? {}) },
          customProfiles: (p.customProfiles ?? []).map((cp) => ({ ...cp, weights: { ...current.weights, ...cp.weights } })),
        };
      },
    },
  ),
);

export const profilesOf = (custom: WeightProfile[]) => allProfiles(custom);
