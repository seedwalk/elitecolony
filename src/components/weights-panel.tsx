"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { CRITERIA, CRITERION_LABEL, type Criterion } from "@/lib/engine/bubbles";
import { normalizeWeights } from "@/lib/engine/scoring";
import { profilesOf, useSettings } from "@/store/settings";

export const CRITERION_COLOR: Record<Criterion, string> = {
  expansion: "#f97316",
  capital: "#f59e0b",
  build: "#3b82f6",
  independence: "#a855f7",
  diversity: "#22c55e",
  location: "#e879f9",
};

export function WeightsPanel() {
  const { weights, setWeight, activeProfile, customProfiles, applyProfile, saveProfile, deleteProfile } = useSettings();
  const pct = normalizeWeights(weights);
  const profiles = profilesOf(customProfiles);
  const [newName, setNewName] = useState("");
  const active = profiles.find((p) => p.name === activeProfile);

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Ranking weights</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <select
            className="h-8 flex-1 rounded-md border bg-background px-2 text-sm"
            value={activeProfile ?? ""}
            onChange={(e) => applyProfile(e.target.value)}
          >
            <option value="" disabled>
              Custom (unsaved)
            </option>
            {profiles.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
          {active && !active.builtin && (
            <Button size="sm" variant="ghost" onClick={() => deleteProfile(active.name)}>
              Delete
            </Button>
          )}
        </div>

        {/* stacked distribution bar */}
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
          {CRITERIA.map((c) => (
            <div
              key={c}
              title={`${CRITERION_LABEL[c]} ${pct[c].toFixed(0)}%`}
              style={{ width: `${pct[c]}%`, background: CRITERION_COLOR[c] }}
            />
          ))}
        </div>

        {CRITERIA.map((c) => (
          <div key={c} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-full" style={{ background: CRITERION_COLOR[c] }} />
                {CRITERION_LABEL[c]}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {weights[c] ?? 0} · <span className="font-medium text-foreground">{pct[c].toFixed(0)}%</span>
              </span>
            </div>
            <Slider
              min={0}
              max={10}
              step={1}
              value={[weights[c] ?? 0]}
              onValueChange={(v) => setWeight(c, Array.isArray(v) ? v[0] : v)}
            />
          </div>
        ))}

        <form
          className="flex gap-2 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) {
              saveProfile(newName.trim());
              setNewName("");
            }
          }}
        >
          <Input
            className="h-8"
            placeholder="Save as profile…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button size="sm" type="submit" variant="secondary">
            Save
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
