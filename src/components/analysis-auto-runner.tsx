"use client";

import { useEffect } from "react";
import { useAnalysis } from "@/store/analysis";
import { useSettings } from "@/store/settings";

/** Re-runs the bubble analysis whenever the region or planner settings change (weights don't need it). */
export function AnalysisAutoRunner() {
  const planner = useSettings((s) => s.planner);
  const regionKey = useSettings((s) => s.currentRegion?.key);
  const capitalFilter = useSettings((s) => s.capitalFilterNames.join("|"));
  const analyse = useAnalysis((s) => s.analyse);
  const loadCachedScan = useAnalysis((s) => s.loadCachedScan);
  const sunMin = useSettings((s) => s.planner.sunMin);
  const sunMax = useSettings((s) => s.planner.sunMax);

  useEffect(() => {
    void loadCachedScan();
  }, [sunMin, sunMax, loadCachedScan]);

  useEffect(() => {
    if (!regionKey) return;
    const t = setTimeout(() => void analyse(), 350);
    return () => clearTimeout(t);
  }, [planner, regionKey, capitalFilter, analyse]);

  return null;
}
