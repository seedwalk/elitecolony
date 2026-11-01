"use client";

import { Button } from "@/components/ui/button";
import { dist } from "@/lib/geo";
import type { Vec3 } from "@/lib/types";
import { useAnalysis } from "@/store/analysis";
import { useSettings } from "@/store/settings";

/**
 * Runs a deep analysis centred on a system and ADDS it to the analysed area — useful for
 * a bubble sitting at the edge of an analysed zone, or any system you want to explore.
 */
export function AnalyseAreaButton({
  system,
  label = "Analyse area",
  onDone,
}: {
  system: Vec3 & { id64: number; name: string };
  label?: string;
  onDone?: () => void;
}) {
  const fetching = useAnalysis((s) => s.fetching);
  const analyseZones = useAnalysis((s) => s.analyseZones);
  const done = useSettings((s) =>
    (s.currentRegion?.spheres ?? []).some((sp) => sp.anchorId64 === system.id64 || dist(sp.center, system) < 1),
  );
  if (done) return <span className="text-[11px] text-cyan-400">✓ area analysed</span>;
  return (
    <Button
      size="xs"
      variant="outline"
      className="rounded-full"
      disabled={fetching}
      title="Download full data around this system and add it to the analysis"
      onClick={async (e) => {
        e.stopPropagation();
        await analyseZones([{ anchorId64: system.id64, name: system.name, x: system.x, y: system.y, z: system.z }]);
        onDone?.();
      }}
    >
      {fetching ? "Working…" : label}
    </Button>
  );
}
