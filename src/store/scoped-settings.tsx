"use client";

import { createContext, useContext, type ReactNode } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import { settingsCreator, useSettings } from "./settings";

type SettingsState = ReturnType<typeof useSettings.getState>;

/** Fields the Filters panel edits as a draft and copies back on Apply. */
export const DRAFT_FIELDS = ["weights", "activeProfile", "customProfiles", "planner", "regionForm", "capitalFilterNames"] as const;
type DraftField = (typeof DRAFT_FIELDS)[number];
export type DraftData = Pick<SettingsState, DraftField>;

export function pickDraft(s: SettingsState): DraftData {
  return Object.fromEntries(DRAFT_FIELDS.map((k) => [k, structuredClone(s[k])])) as DraftData;
}

/** A non-persisted copy of the settings store, seeded from the real one. */
export function createDraftStore(): StoreApi<SettingsState> {
  const store = createStore<SettingsState>()(settingsCreator);
  store.setState(pickDraft(useSettings.getState()));
  return store;
}

const DraftContext = createContext<StoreApi<SettingsState> | null>(null);

export function DraftScope({ store, children }: { store: StoreApi<SettingsState>; children: ReactNode }) {
  return <DraftContext.Provider value={store}>{children}</DraftContext.Provider>;
}

/** Settings for panels: the draft when rendered inside the Filters panel, the live store otherwise. */
export function useScopedSettings(): SettingsState {
  const draft = useContext(DraftContext);
  return useStore(draft ?? useSettings);
}

export function useIsDraft(): boolean {
  return useContext(DraftContext) !== null;
}

/** Number of top-level settings groups that differ between draft and live. */
export function countChanges(draft: DraftData, live: SettingsState): number {
  let n = 0;
  const p1 = draft.planner as unknown as Record<string, unknown>;
  const p2 = live.planner as unknown as Record<string, unknown>;
  for (const k of Object.keys(p1)) if (JSON.stringify(p1[k]) !== JSON.stringify(p2[k])) n++;
  for (const k of ["weights", "regionForm", "capitalFilterNames", "customProfiles"] as const)
    if (JSON.stringify(draft[k]) !== JSON.stringify(live[k])) n++;
  return n;
}
