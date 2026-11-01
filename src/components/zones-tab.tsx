"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { CertaintyTag, RoleChip } from "@/components/bits";
import { CardList, CriteriaBars, FilterBar, FilterPill, ListingCard, ScoreBadge, SplitListing, Stat } from "@/components/listing";
import type { MapPoint } from "@/components/space-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { CRITERIA, type Criterion } from "@/lib/engine/bubbles";
import { filterZones, pickDistinctZones, rankZones, scoreZones, type RankedZone } from "@/lib/engine/frontier";
import { ROLES } from "@/lib/types";
import { useAnalysis } from "@/store/analysis";
import { useSettings } from "@/store/settings";

const SpaceMap = dynamic(() => import("@/components/space-map"), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse rounded-lg border bg-muted/30" />,
});

type Row = RankedZone & { rank: number };
const first = (v: number | readonly number[]) => (Array.isArray(v) ? v[0] : (v as number));

export function bridgeLabel(n: number) {
  return n === 0 ? "direct" : n < 0 ? "?" : `${n} bridge${n > 1 ? "s" : ""}`;
}

const SORTS = {
  score: { label: "Best score", fn: (a: Row, b: Row) => b.score - a.score },
  anchors: { label: "Most anchors nearby", fn: (a: Row, b: Row) => b.zone.neighbours - a.zone.neighbours },
  isolated: { label: "Most isolated", fn: (a: Row, b: Row) => (b.zone.nearestPopulated ?? 0) - (a.zone.nearestPopulated ?? 0) },
  capital: { label: "Best capital", fn: (a: Row, b: Row) => b.zone.criteria.capital.score - a.zone.criteria.capital.score },
  outer: { label: "Farthest from Sol", fn: (a: Row, b: Row) => b.zone.sunDist - a.zone.sunDist },
  inner: { label: "Closest to Sol", fn: (a: Row, b: Row) => a.zone.sunDist - b.zone.sunDist },
} as const;
type SortKey = keyof typeof SORTS;

export function ZonesTab({ onAnalysed }: { onAnalysed: () => void }) {
  const { scan, fetching, analyseZones, selectedZones, toggleZone, setSelectedZones, clearAnalysed } = useAnalysis();
  const { planner, setPlanner, weights, zoneFilters, setZoneFilters, currentRegion } = useSettings();
  const [topN, setTopN] = useState(5);
  const [focus, setFocus] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [sort, setSort] = useState<SortKey>("score");
  const [query, setQuery] = useState("");

  const zones = useMemo(() => (scan ? scoreZones(scan.systems, planner) : []), [scan, planner]);
  const visible = useMemo(
    () => filterZones(zones, { maxBridges: planner.maxBridges, ...zoneFilters }),
    [zones, planner.maxBridges, zoneFilters],
  );
  const ranked: Row[] = useMemo(() => rankZones(visible, weights).map((r, i) => ({ ...r, rank: i + 1 })), [visible, weights]);
  const listed = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q ? ranked.filter((r) => r.zone.name.toLowerCase().includes(q)) : ranked;
    return sort === "score" ? rows : [...rows].sort(SORTS[sort].fn);
  }, [ranked, sort, query]);
  const byId = useMemo(() => new Map(ranked.map((r) => [r.zone.anchorId64, r])), [ranked]);
  const analysed = useMemo(
    () => new Set((currentRegion?.spheres ?? []).map((s) => s.anchorId64).filter((x): x is number => x !== undefined)),
    [currentRegion],
  );

  const analyse = async (ids: number[]) => {
    const zs = ids.map((id) => byId.get(id)?.zone).filter((z): z is NonNullable<typeof z> => !!z);
    if (zs.length === 0) return;
    await analyseZones(zs);
    onAnalysed();
  };

  const points: MapPoint[] = useMemo(() => {
    if (ranked.length === 0) return [];
    const max = ranked[0].score;
    const min = ranked[ranked.length - 1].score;
    return listed.map((r) => {
      const t = (r.score - min) / Math.max(1, max - min);
      return {
        id: r.zone.anchorId64,
        name: r.zone.name,
        x: r.zone.x,
        y: r.zone.y,
        z: r.zone.z,
        color: analysed.has(r.zone.anchorId64) ? "#22d3ee" : `hsl(${Math.round(20 + t * 110)}, 85%, ${Math.round(32 + t * 28)}%)`,
        info: `#${r.rank} · score ${r.score} · ${bridgeLabel(r.zone.bridgeHops)} · ${r.zone.neighbours} anchors nearby`,
      };
    });
  }, [ranked, listed, analysed]);

  if (!scan) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        No frontier scan for {planner.sunMin}–{planner.sunMax} ly yet. Choose <em>Frontier</em> in the search area and press{" "}
        <em>Scan frontier</em>.
      </div>
    );
  }

  const selectedList = [...selectedZones].filter((id) => byId.has(id));
  const bridgeText = planner.maxBridges < 0 ? "Any" : planner.maxBridges === 0 ? "Direct only" : `≤ ${planner.maxBridges}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <FilterBar>
        <Input className="h-8 w-52 rounded-full" placeholder="Search zone…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <FilterPill label="Claim" value={bridgeText} active={planner.maxBridges !== -1}>
          <div className="mb-2 flex justify-between">
            <span className="font-medium">Max claim bridges</span>
            <span className="text-muted-foreground">{bridgeText}</span>
          </div>
          <Slider
            min={0}
            max={10}
            step={1}
            value={[planner.maxBridges < 0 ? 10 : planner.maxBridges]}
            onValueChange={(v) => setPlanner({ maxBridges: first(v) >= 10 ? -1 : first(v) })}
          />
          <p className="mt-2 text-muted-foreground">
            Outposts you&apos;d build to reach the zone. Claims reach 15 ly from a populated system — 0 means you can claim it
            directly from the bubble (first colony).
          </p>
        </FilterPill>
        <FilterPill label="Anchors nearby" value={`≥ ${zoneFilters.minNeighbours}`} active={zoneFilters.minNeighbours > 0}>
          <div className="mb-2 flex justify-between">
            <span className="font-medium">Min claimable anchors within {planner.maxRadius} ly</span>
            <span className="text-muted-foreground">{zoneFilters.minNeighbours}</span>
          </div>
          <Slider min={0} max={20} step={1} value={[zoneFilters.minNeighbours]} onValueChange={(v) => setZoneFilters({ minNeighbours: first(v) })} />
          <p className="mt-2 text-muted-foreground">
            Anchors are unpopulated systems with tourism-grade bodies (ELW, WW, AW, black holes, neutron stars, white dwarfs) —
            room to grow the bubble.
          </p>
        </FilterPill>
        <FilterPill label="Isolation" value={`≥ ${zoneFilters.minNearestPopulated} ly`} active={zoneFilters.minNearestPopulated > 0}>
          <div className="mb-2 flex justify-between">
            <span className="font-medium">Min distance to nearest populated</span>
            <span className="text-muted-foreground">{zoneFilters.minNearestPopulated} ly</span>
          </div>
          <Slider
            min={0}
            max={60}
            step={1}
            value={[zoneFilters.minNearestPopulated]}
            onValueChange={(v) => setZoneFilters({ minNearestPopulated: first(v) })}
          />
          <p className="mt-2 text-muted-foreground">With “Direct only”, anything above 15 ly leaves no zones.</p>
        </FilterPill>
        <FilterPill label="Sort" value={SORTS[sort].label} active={sort !== "score"}>
          <div className="space-y-1">
            {(Object.keys(SORTS) as SortKey[]).map((k) => (
              <label key={k} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted">
                <input type="radio" checked={sort === k} onChange={() => setSort(k)} />
                {SORTS[k].label}
              </label>
            ))}
          </div>
        </FilterPill>

        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() =>
                setSelectedZones([
                  ...selectedList,
                  ...pickDistinctZones(ranked.filter((r) => !analysed.has(r.zone.anchorId64)), topN, planner.maxRadius * 2).map(
                    (p) => p.zone.anchorId64,
                  ),
                ])
              }
            >
              Select top
            </Button>
            <input
              type="number"
              min={1}
              max={20}
              value={topN}
              onChange={(e) => setTopN(Math.max(1, Math.min(20, Number(e.target.value))))}
              className="h-7 w-10 rounded border bg-background px-1"
            />
          </span>
          <Button size="sm" className="rounded-full" disabled={fetching || selectedList.length === 0} onClick={() => void analyse(selectedList)}>
            Analyse selected ({selectedList.length})
          </Button>
          {selectedList.length > 0 && (
            <button className="underline" onClick={() => setSelectedZones([])}>
              clear
            </button>
          )}
          {analysed.size > 0 && (
            <button className="text-muted-foreground underline" onClick={clearAnalysed}>
              clear {analysed.size} analysed
            </button>
          )}
        </div>
      </FilterBar>

      <SplitListing
        list={
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="text-sm font-medium text-foreground">{listed.length.toLocaleString()} zones</span>
              in {scan.sunMin}–{scan.sunMax} ly · {scan.systems.length.toLocaleString()} scanned
              <CertaintyTag c="estimated" />
              body summaries only — analyse for rings, hotspots, markets and colonies
            </div>
            <CardList
              items={listed}
              getId={(r) => r.zone.anchorId64}
              selectedId={focus}
              empty="No zone matches your filters — try allowing a bridge or lowering the isolation filter."
              renderCard={(r) => {
                const id = r.zone.anchorId64;
                const isAnalysed = analysed.has(id);
                const scores = Object.fromEntries(CRITERIA.map((c) => [c, r.zone.criteria[c].score])) as Record<Criterion, number>;
                return (
                  <ListingCard
                    key={id}
                    cardId={id}
                    selected={focus === id}
                    onSelect={() => setFocus(id)}
                    onOpen={() => {
                      if (!isAnalysed) void analyse([id]);
                    }}
                    onHover={(on) => setHover(on ? id : null)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[10px] text-muted-foreground">#{r.rank}</div>
                        <div className="truncate text-sm font-semibold" title={r.zone.name}>
                          {r.zone.name}
                        </div>
                      </div>
                      <ScoreBadge score={r.score} />
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <Stat
                        label="Claim"
                        value={
                          <span className={r.zone.bridgeHops === 0 ? "text-emerald-400" : "text-amber-400"}>{bridgeLabel(r.zone.bridgeHops)}</span>
                        }
                      />
                      <Stat label="Anchors" value={r.zone.neighbours} />
                      <Stat label="Nearest pop." value={r.zone.nearestPopulated === null ? "?" : `${r.zone.nearestPopulated.toFixed(1)} ly`} />
                      <Stat label="From Sol" value={`${r.zone.sunDist.toFixed(0)} ly`} />
                    </div>
                    <div className="flex min-h-5 flex-wrap gap-1">
                      {ROLES.filter((x) => r.zone.coveredRoles.includes(x)).map((x) => (
                        <RoleChip key={x} role={x} />
                      ))}
                    </div>
                    <CriteriaBars scores={scores} />
                    <div className="flex items-center justify-between gap-2 border-t pt-2" onClick={(e) => e.stopPropagation()}>
                      <label className="flex cursor-pointer items-center gap-1.5">
                        <input type="checkbox" checked={selectedZones.has(id)} onChange={() => toggleZone(id)} />
                        Select
                      </label>
                      {isAnalysed ? (
                        <span className="text-cyan-400">✓ analysed</span>
                      ) : (
                        <Button size="xs" variant="outline" className="rounded-full" disabled={fetching} onClick={() => void analyse([id])}>
                          Analyse
                        </Button>
                      )}
                    </div>
                  </ListingCard>
                );
              }}
            />
          </div>
        }
        map={
          <SpaceMap
            className="h-full"
            centerOn="data"
            showSol
            points={points}
            marked={selectedZones}
            labelled={[...selectedList, ...analysed].slice(0, 30)}
            selectedId={focus}
            highlightId={hover}
            flyDistance={120}
            onSelect={(id, { shift }) => (shift ? toggleZone(id) : setFocus(id))}
            onOpen={(id) => void analyse([id])}
            overlay={
              <div className="rounded bg-black/70 px-2 py-1 text-[11px] text-zinc-300">
                bright = better · <span className="text-orange-400">◯ selected</span> · <span className="text-cyan-400">● analysed</span> ·
                shift+click to select · double-click to analyse
              </div>
            }
          />
        }
      />
    </div>
  );
}
