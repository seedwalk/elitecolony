"use client";

import { useHydrated } from "@/components/bits";
import { BubbleSettingsPanel, LogisticsPanel } from "@/components/bubble-settings-panel";
import { PlannerTabs } from "@/components/planner-tabs";
import { RegionPanel } from "@/components/region-panel";
import { WeightsPanel } from "@/components/weights-panel";

export default function PlannerPage() {
  const hydrated = useHydrated();
  if (!hydrated) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <aside className="space-y-3">
        <RegionPanel />
        <WeightsPanel />
        <BubbleSettingsPanel />
        <LogisticsPanel />
      </aside>
      <section className="min-w-0">
        <PlannerTabs />
      </section>
    </div>
  );
}
