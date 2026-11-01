"use client";

import { useEffect, useState } from "react";
import { BubbleSettingsPanel, LogisticsPanel } from "@/components/bubble-settings-panel";
import { RegionPanel } from "@/components/region-panel";
import { Button } from "@/components/ui/button";
import { WeightsPanel } from "@/components/weights-panel";
import { useAnalysis } from "@/store/analysis";
import { countChanges, createDraftStore, DraftScope, pickDraft } from "@/store/scoped-settings";
import { useSettings } from "@/store/settings";
import { useStore } from "zustand";

/**
 * Airbnb-style "Filters": everything visible at once, edited as a draft and applied together.
 * Applying copies the draft into the live settings (which re-runs the analysis) and, when the
 * search area changed, also runs the search.
 */
export function FiltersPanel({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState(() => createDraftStore());
  const draftState = useStore(draft);
  const live = useSettings();
  const changes = countChanges(pickDraft(draftState), live);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const apply = () => {
    const d = pickDraft(draftState);
    const before = useSettings.getState();
    const searchChanged =
      JSON.stringify(d.regionForm) !== JSON.stringify(before.regionForm) ||
      d.planner.sunMin !== before.planner.sunMin ||
      d.planner.sunMax !== before.planner.sunMax;
    useSettings.setState(d);
    onClose();
    if (searchChanged) {
      const a = useAnalysis.getState();
      if (d.regionForm.mode === "frontier") void a.runScan();
      else if (d.regionForm.mode === "coords" || d.regionForm.system) void a.fetchCurrentForm();
    }
  };

  const col = "min-w-0 space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4";

  return (
    <div className="flex max-h-[55vh] shrink-0 flex-col rounded-2xl border border-zinc-700 bg-zinc-900 p-4 text-xs text-zinc-100 shadow-2xl shadow-black/60">
      <DraftScope store={draft}>
        <div className="grid min-h-0 gap-3 overflow-y-auto md:grid-cols-2 2xl:grid-cols-4">
          <div className={col}>
            <RegionPanel />
          </div>
          <div className={col}>
            <WeightsPanel />
          </div>
          <div className={col}>
            <BubbleSettingsPanel />
          </div>
          <div className={col}>
            <LogisticsPanel />
          </div>
        </div>
      </DraftScope>
      <div className="mt-4 flex shrink-0 items-center justify-between gap-3 border-t border-zinc-800 pt-3">
        <span className="text-muted-foreground">
          {changes === 0 ? "No changes" : `${changes} change${changes > 1 ? "s" : ""} not applied yet`}
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" disabled={changes === 0} onClick={() => setDraft(createDraftStore())}>
            Reset
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button size="sm" className="rounded-full bg-orange-500 px-4 text-black hover:bg-orange-400" disabled={changes === 0} onClick={apply}>
            Apply &amp; re-analyse
          </Button>
        </div>
      </div>
    </div>
  );
}
