"use client";

import { useAnalysis } from "@/store/analysis";
import { useSettings } from "@/store/settings";

/** Airbnb-style search capsule: segments summarise the search, the round button runs it. */
export function SearchCapsule({ onEdit }: { onEdit: () => void }) {
  const { regionForm: f, planner, capitalFilterNames } = useSettings();
  const { fetching, progress, runScan, fetchCurrentForm, cancelFetch } = useAnalysis();
  const where =
    capitalFilterNames.length > 0
      ? `${capitalFilterNames.length} pasted systems`
      : f.mode === "frontier"
        ? "Frontier"
        : f.mode === "system"
          ? (f.system?.name ?? "Pick a system")
          : `${f.coords.x}, ${f.coords.y}, ${f.coords.z}`;
  const range = f.mode === "frontier" ? `${planner.sunMin}–${planner.sunMax} ly from Sol` : `${f.radius} ly radius`;
  const prefer = f.mode === "frontier" ? planner.sunPreference : null;
  const canRun = f.mode === "frontier" || f.mode === "coords" || !!f.system;
  const pct = progress && progress.total > 0 ? Math.min(100, (progress.fetched / progress.total) * 100) : 0;

  const seg = "flex flex-col items-start rounded-full px-5 py-1.5 text-left hover:bg-muted";

  return (
    <div className="relative">
      <div className="flex items-center rounded-full border bg-card shadow-md shadow-black/30">
        <button className={seg} onClick={onEdit}>
          <span className="text-[10px] font-semibold">Where</span>
          <span className="max-w-48 truncate text-xs text-muted-foreground">{where}</span>
        </button>
        <span className="h-6 w-px bg-border" />
        <button className={seg} onClick={onEdit}>
          <span className="text-[10px] font-semibold">Range</span>
          <span className="text-xs text-muted-foreground">{range}</span>
        </button>
        {prefer && (
          <>
            <span className="h-6 w-px bg-border" />
            <button className={seg} onClick={onEdit}>
              <span className="text-[10px] font-semibold">Prefer</span>
              <span className="text-xs text-muted-foreground capitalize">{prefer}</span>
            </button>
          </>
        )}
        <button
          title={fetching ? "Cancel" : f.mode === "frontier" ? "Scan frontier" : "Search"}
          disabled={!fetching && !canRun}
          onClick={() => {
            if (fetching) cancelFetch();
            else if (f.mode === "frontier") void runScan();
            else void fetchCurrentForm();
          }}
          className="m-1 flex h-9 items-center gap-1.5 rounded-full bg-orange-500 px-4 text-xs font-semibold text-black hover:bg-orange-400 disabled:opacity-50"
        >
          {fetching ? "■ Cancel" : "⌕ Search"}
        </button>
      </div>
      {fetching && progress && (
        <div className="absolute top-full right-4 left-4 mt-1">
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-orange-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-0.5 truncate text-center text-[10px] text-muted-foreground">{progress.message}</div>
        </div>
      )}
    </div>
  );
}
