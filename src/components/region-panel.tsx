"use client";

import { useState } from "react";
import { SystemAutocomplete } from "@/components/system-autocomplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import type { SunPreference } from "@/lib/engine/bubbles";
import { useAnalysis } from "@/store/analysis";
import { useIsDraft, useScopedSettings } from "@/store/scoped-settings";

/** Rough size estimate of a frontier scan (measured: ~36 anchor systems per ly of band at 250–350 ly). */
function scanEstimate(min: number, max: number) {
  const mid = (min + max) / 2;
  const perLy = 36 * (mid / 300) ** 1.2;
  const systems = Math.round((max - min) * perLy);
  return { systems, mb: Math.round((systems * 5.8) / 1000) };
}

export function RegionPanel() {
  const { regionForm: f, setRegionForm, capitalFilterNames, setCapitalFilterNames, planner, setPlanner } = useScopedSettings();
  const { fetching, progress, fetchError, fetchCurrentForm, fetchAroundNames, cancelFetch, unmatchedNames, runScan } = useAnalysis();
  const isDraft = useIsDraft();
  const [list, setList] = useState("");
  const [tab, setTab] = useState<"area" | "list">("area");
  const pct = progress && progress.total > 0 ? Math.min(100, (progress.fetched / progress.total) * 100) : 0;
  const est = scanEstimate(planner.sunMin, planner.sunMax);

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold">Search area</div>
      <div className="space-y-3">
        <div className="flex overflow-hidden rounded-md border text-xs">
          {(
            [
              ["area", "Area"],
              ["list", "Paste systems"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              className={`flex-1 px-2 py-1.5 ${tab === k ? "bg-primary text-primary-foreground" : ""}`}
              onClick={() => setTab(k)}
            >
              {l}
            </button>
          ))}
        </div>

        {tab === "area" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3 text-xs">
              {(
                [
                  ["frontier", "Frontier (distance to Sol)"],
                  ["system", "Around a system"],
                  ["coords", "Coordinates"],
                ] as const
              ).map(([m, label]) => (
                <label key={m} className="flex items-center gap-1">
                  <input type="radio" checked={f.mode === m} onChange={() => setRegionForm({ mode: m })} />
                  {label}
                </label>
              ))}
            </div>

            {f.mode === "frontier" ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span>Distance from Sol</span>
                    <span className="tabular-nums text-muted-foreground">
                      {planner.sunMin} – {planner.sunMax} ly
                    </span>
                  </div>
                  <Slider
                    min={100}
                    max={1200}
                    step={10}
                    value={[planner.sunMin, planner.sunMax]}
                    onValueChange={(v) => {
                      const [a, b] = v as number[];
                      setPlanner({ sunMin: a, sunMax: b });
                    }}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    ≈ {est.systems.toLocaleString()} candidate systems · ~{est.mb} MB download
                    {est.mb > 60 && <span className="text-amber-400"> — wide band, consider narrowing</span>}
                  </p>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span>Prefer</span>
                  <div className="flex overflow-hidden rounded-md border">
                    {(["inner", "neutral", "outer"] as SunPreference[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`px-2.5 py-1 capitalize ${planner.sunPreference === p ? "bg-primary text-primary-foreground" : ""}`}
                        onClick={() => setPlanner({ sunPreference: p })}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={isDraft ? "hidden" : "flex gap-2"}>
                  <Button size="sm" className="flex-1" disabled={fetching} onClick={() => void runScan()}>
                    {fetching ? "Working…" : "Scan frontier"}
                  </Button>
                  <Button size="sm" variant="secondary" disabled={fetching} onClick={() => void runScan(true)}>
                    Refresh
                  </Button>
                </div>
              </div>
            ) : (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (isDraft) return; // applied from the Filters panel
                  setCapitalFilterNames([]);
                  void fetchCurrentForm();
                }}
              >
                {f.mode === "system" ? (
                  <SystemAutocomplete value={f.system} onChange={(s) => setRegionForm({ system: s })} />
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["x", "y", "z"] as const).map((k) => (
                      <Input
                        key={k}
                        className="h-8"
                        type="number"
                        step="any"
                        aria-label={k}
                        placeholder={k}
                        value={f.coords[k]}
                        onChange={(e) => setRegionForm({ coords: { ...f.coords, [k]: Number(e.target.value) } })}
                      />
                    ))}
                  </div>
                )}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span>Radius</span>
                    <span className="tabular-nums text-muted-foreground">{f.radius} ly</span>
                  </div>
                  <Slider
                    min={10}
                    max={100}
                    step={5}
                    value={[f.radius]}
                    onValueChange={(v) => setRegionForm({ radius: Array.isArray(v) ? v[0] : (v as number) })}
                  />
                  <p className="text-[11px] text-muted-foreground">~40 ly ≈ 550 systems / 6k bodies / 4 MB.</p>
                </div>
                <div className={isDraft ? "hidden" : "flex gap-2"}>
                  <Button size="sm" type="submit" disabled={fetching || (f.mode === "system" && !f.system)} className="flex-1">
                    {fetching ? "Fetching…" : "Search"}
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    variant="secondary"
                    disabled={fetching || (f.mode === "system" && !f.system)}
                    onClick={() => void fetchCurrentForm(true)}
                  >
                    Refresh
                  </Button>
                </div>
              </form>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Textarea
              rows={6}
              className="text-xs"
              placeholder={"One system per line (e.g. copied from ED Colonise)\nSynuefe HA-I b57-8\nSynuefe HK-C d14-129"}
              value={list}
              onChange={(e) => setList(e.target.value)}
            />
            <Button
              size="sm"
              className="w-full"
              disabled={fetching}
              onClick={() => {
                const names = [...new Set(list.split(/\r?\n|,|;/).map((s) => s.trim()).filter(Boolean))];
                if (names.length) void fetchAroundNames(names);
              }}
            >
              Analyse these as capitals
            </Button>
            {capitalFilterNames.length > 0 && (
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Capitals limited to {capitalFilterNames.length} pasted system(s)</span>
                <button className="underline" onClick={() => setCapitalFilterNames([])}>
                  clear
                </button>
              </div>
            )}
          </div>
        )}

        {!isDraft && fetching && progress && (
          <div className="space-y-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-orange-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex justify-between gap-2 text-[11px] text-muted-foreground">
              <span className="truncate">{progress.message}</span>
              <button className="underline" onClick={cancelFetch}>
                cancel
              </button>
            </div>
          </div>
        )}
        {fetchError && <p className="text-xs text-red-400">{fetchError}</p>}
        {unmatchedNames.length > 0 && (
          <p className="text-xs text-amber-400">Not found / outside region: {unmatchedNames.join(", ")}</p>
        )}
      </div>
    </div>
  );
}
