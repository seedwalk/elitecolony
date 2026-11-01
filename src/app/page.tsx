"use client";

import { useState } from "react";
import { useHydrated } from "@/components/bits";
import { FiltersPanel } from "@/components/filters-panel";
import { PlannerTabs } from "@/components/planner-tabs";
import { SearchCapsule } from "@/components/search-capsule";
import { useAnalysis } from "@/store/analysis";
import { useSettings } from "@/store/settings";

export default function PlannerPage() {
  const hydrated = useHydrated();
  const [showFilters, setShowFilters] = useState(false);
  const { activeProfile, planner } = useSettings();
  const fetchError = useAnalysis((s) => s.fetchError);
  if (!hydrated) return null;

  const summary = [
    activeProfile ?? "Custom weights",
    `${planner.targetRoles.length} roles`,
    `${planner.sizeMin}–${planner.sizeMax} systems`,
    planner.maxBridges === 0 ? "direct claim" : planner.maxBridges < 0 ? "any bridges" : `≤${planner.maxBridges} bridges`,
    `${planner.logistics.hasFleetCarrier ? "FC · " : ""}${planner.logistics.minPad} pad · ${planner.logistics.maxHaulLy} ly haul`,
  ].join(" · ");

  return (
    <div className="flex h-[calc(100vh-4.5rem)] min-h-[560px] flex-col gap-3">
      {/* Airbnb-style top bar */}
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-3">
        <SearchCapsule onEdit={() => setShowFilters(true)} />
        <button
          onClick={() => setShowFilters((s) => !s)}
          className={`flex h-11 items-center gap-2 rounded-full border px-4 text-xs transition-colors ${
            showFilters ? "border-foreground bg-foreground/10" : "hover:border-foreground/60"
          }`}
        >
          <span className="font-semibold">⚙ Filters</span>
          <span className="max-w-[420px] truncate text-muted-foreground">{summary}</span>
          <span className="text-[9px] text-muted-foreground">{showFilters ? "▴" : "▾"}</span>
        </button>
      </div>
      {showFilters && <FiltersPanel onClose={() => setShowFilters(false)} />}
      {fetchError && <p className="shrink-0 text-center text-xs text-red-400">{fetchError}</p>}
      <div className="flex min-h-0 flex-1 flex-col">
        <PlannerTabs />
      </div>
    </div>
  );
}
