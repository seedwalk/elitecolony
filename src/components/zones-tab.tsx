"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { CertaintyTag, RoleChip, ScoreBar } from "@/components/bits";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { CRITERIA, CRITERION_LABEL } from "@/lib/engine/bubbles";
import { pickDistinctZones, rankZones, scoreZones, type RankedZone } from "@/lib/engine/frontier";
import { ROLES } from "@/lib/types";
import { useAnalysis } from "@/store/analysis";
import { useSettings } from "@/store/settings";
import { CRITERION_COLOR } from "./weights-panel";

const zc = createColumnHelper<RankedZone & { rank: number }>();

export function ZonesTab({ onAnalysed }: { onAnalysed: () => void }) {
  const { scan, fetching, analyseZones } = useAnalysis();
  const planner = useSettings((s) => s.planner);
  const weights = useSettings((s) => s.weights);
  const [topN, setTopN] = useState(5);
  const [directOnly, setDirectOnly] = useState(false);

  const zones = useMemo(() => (scan ? scoreZones(scan.systems, planner) : []), [scan, planner]);
  const ranked = useMemo(
    () =>
      rankZones(directOnly ? zones.filter((z) => z.bridgeHops === 0) : zones, weights).map((r, i) => ({ ...r, rank: i + 1 })),
    [zones, weights, directOnly],
  );
  const picks = useMemo(() => pickDistinctZones(ranked, topN, planner.maxRadius * 2), [ranked, topN, planner.maxRadius]);
  const pickSet = useMemo(() => new Set(picks.map((p) => p.zone.anchorId64)), [picks]);

  const columns = useMemo(
    () => [
      zc.accessor("rank", { header: "#", enableHiding: false }),
      zc.accessor((r) => r.zone.name, {
        id: "zone",
        header: "Zone centre",
        enableHiding: false,
        cell: (c) => (
          <span className={pickSet.has(c.row.original.zone.anchorId64) ? "font-medium text-orange-300" : ""}>
            {pickSet.has(c.row.original.zone.anchorId64) && "◆ "}
            {c.getValue()}
          </span>
        ),
      }),
      zc.accessor("score", { header: "Score", cell: (c) => <ScoreBar value={c.getValue()} /> }),
      zc.accessor((r) => r.zone.sunDist, { id: "sun", header: "From Sol (ly)", cell: (c) => c.getValue().toFixed(0) }),
      zc.accessor((r) => r.zone.nearestPopulated, {
        id: "npd",
        header: "Nearest pop. (ly)",
        cell: (c) => (c.getValue() === null ? "?" : c.getValue()!.toFixed(1)),
      }),
      zc.accessor((r) => r.zone.bridgeHops, {
        id: "bridge",
        header: "Claim",
        cell: (c) => (c.getValue() === 0 ? "direct" : c.getValue() < 0 ? "?" : `${c.getValue()} bridge`),
      }),
      zc.accessor((r) => r.zone.neighbours, { id: "nb", header: "Nearby anchors" }),
      zc.accessor((r) => r.zone.coveredRoles.length, {
        id: "roles",
        header: "Roles seen",
        cell: (c) => (
          <span className="flex min-w-[200px] flex-wrap gap-0.5 whitespace-normal">
            {ROLES.filter((r) => c.row.original.zone.coveredRoles.includes(r)).map((r) => (
              <RoleChip key={r} role={r} />
            ))}
          </span>
        ),
      }),
      ...CRITERIA.map((k) =>
        zc.accessor((r) => r.zone.criteria[k].score, {
          id: k,
          header: CRITERION_LABEL[k],
          cell: (c) => <ScoreBar value={c.getValue()} color={CRITERION_COLOR[k]} />,
        }),
      ),
      zc.display({
        id: "go",
        header: "",
        enableHiding: false,
        cell: (c) => (
          <Button
            size="xs"
            variant="outline"
            disabled={fetching}
            onClick={async (e) => {
              e.stopPropagation();
              await analyseZones([c.row.original.zone]);
              onAnalysed();
            }}
          >
            Analyse
          </Button>
        ),
      }),
    ],
    [pickSet, fetching, analyseZones, onAnalysed],
  );

  if (!scan) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        No frontier scan for {planner.sunMin}–{planner.sunMax} ly yet. Choose <em>Frontier</em> in the search area and press{" "}
        <em>Scan frontier</em>.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-md border p-2 text-xs">
        <span>
          {scan.systems.length.toLocaleString()} unpopulated systems with tourism-grade bodies · {zones.length.toLocaleString()} claimable ·
          band {scan.sunMin}–{scan.sunMax} ly · scanned {new Date(scan.fetchedAt).toLocaleDateString()}
        </span>
        <CertaintyTag c="estimated" />
        <span className="text-muted-foreground">Body summaries only — analyse a zone for rings, hotspots, landables and markets.</span>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={directOnly} onChange={(e) => setDirectOnly(e.target.checked)} />
          Only directly claimable (no bridge)
        </label>
        <span className="ml-auto flex items-center gap-2">
          Analyse top
          <input
            type="number"
            min={1}
            max={12}
            value={topN}
            onChange={(e) => setTopN(Math.max(1, Math.min(12, Number(e.target.value))))}
            className="h-7 w-12 rounded border bg-background px-1"
          />
          distinct zones
          <Button
            size="sm"
            disabled={fetching || picks.length === 0}
            onClick={async () => {
              await analyseZones(picks.map((p) => p.zone));
              onAnalysed();
            }}
          >
            Analyse ◆
          </Button>
        </span>
      </div>

      <ZoneMap ranked={ranked} picks={pickSet} />

      <DataTable data={ranked} columns={columns} placeholder="Filter zones…" />
    </div>
  );
}

/** Top-down (x/z) map of the scanned band, coloured by zone score; picks highlighted. */
function ZoneMap({ ranked, picks }: { ranked: RankedZone[]; picks: Set<number> }) {
  const [hover, setHover] = useState<RankedZone | null>(null);
  if (ranked.length === 0) return null;
  const xs = ranked.map((r) => r.zone.x);
  const zs = ranked.map((r) => r.zone.z);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 0);
  const minZ = Math.min(...zs, 0);
  const maxZ = Math.max(...zs, 0);
  const span = Math.max(maxX - minX, maxZ - minZ, 1);
  const W = 520;
  const px = (x: number) => ((x - minX) / span) * W;
  const pz = (z: number) => W - ((z - minZ) / span) * W; // galactic "up" (+z, toward the core) at the top
  const maxScore = Math.max(...ranked.map((r) => r.score));
  const minScore = Math.min(...ranked.map((r) => r.score));
  const color = (s: number) => {
    const t = (s - minScore) / Math.max(1, maxScore - minScore);
    return `hsl(${20 + t * 120} 80% ${30 + t * 25}%)`;
  };
  const drawn = [...ranked].reverse(); // best on top

  return (
    <div className="flex flex-wrap items-start gap-3">
      <svg viewBox={`-10 -10 ${W + 20} ${W + 20}`} className="h-[360px] w-[360px] rounded-md border bg-black">
        <circle cx={px(0)} cy={pz(0)} r={4} fill="#fde047" />
        <text x={px(0) + 6} y={pz(0) + 4} fontSize={12} fill="#fde047">
          Sol
        </text>
        {drawn.map((r) => (
          <circle
            key={r.zone.anchorId64}
            cx={px(r.zone.x)}
            cy={pz(r.zone.z)}
            r={picks.has(r.zone.anchorId64) ? 6 : 2}
            fill={picks.has(r.zone.anchorId64) ? "#fb923c" : color(r.score)}
            stroke={picks.has(r.zone.anchorId64) ? "#fff" : "none"}
            onMouseEnter={() => setHover(r)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>
      <div className="w-64 space-y-1 text-xs text-muted-foreground">
        <p>Top-down view (x / z). Brighter = better score for your current weights. ◆ = zones picked for analysis.</p>
        {hover ? (
          <div className="rounded border p-2 text-foreground">
            <div className="font-medium">{hover.zone.name}</div>
            <div>score {hover.score} · {hover.zone.sunDist.toFixed(0)} ly from Sol</div>
            <div>nearest populated {hover.zone.nearestPopulated?.toFixed(1) ?? "?"} ly · {hover.zone.neighbours} anchors nearby</div>
          </div>
        ) : (
          <p>Hover a point for details.</p>
        )}
      </div>
    </div>
  );
}
