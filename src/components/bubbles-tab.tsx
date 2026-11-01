"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { RoleChip } from "@/components/bits";
import { CardList, CriteriaBars, FilterBar, FilterPill, ListingCard, ScoreBadge, SplitListing, Stat } from "@/components/listing";
import type { MapBubble, MapPoint } from "@/components/space-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { CRITERIA, RISK_LABEL, type Criterion, type RiskCode, type SystemAnalysis } from "@/lib/engine/bubbles";
import type { RankedCapital } from "@/lib/engine/scoring";
import { ROLES, type Role } from "@/lib/types";
import { useSettings } from "@/store/settings";
import { AnalyseAreaButton } from "./analyse-area-button";
import { CompetitionLine } from "./competition-line";
import { bridgeLabel } from "./zones-tab";

const SpaceMap = dynamic(() => import("@/components/space-map"), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse rounded-lg border bg-muted/30" />,
});

type Row = RankedCapital & { rank: number };
const first = (v: number | readonly number[]) => (Array.isArray(v) ? v[0] : (v as number));

const SORTS = {
  score: { label: "Best score", fn: (a: Row, b: Row) => b.recommendedScore - a.recommendedScore },
  small: { label: "Fewest systems", fn: (a: Row, b: Row) => a.recommended.size - b.recommended.size || b.recommendedScore - a.recommendedScore },
  capital: { label: "Best capital", fn: (a: Row, b: Row) => b.recommended.criteria.capital.score - a.recommended.criteria.capital.score },
  independence: {
    label: "Most independent",
    fn: (a: Row, b: Row) => b.recommended.criteria.independence.score - a.recommended.criteria.independence.score,
  },
  build: { label: "Easiest to build", fn: (a: Row, b: Row) => b.recommended.criteria.build.score - a.recommended.criteria.build.score },
  compact: { label: "Most compact", fn: (a: Row, b: Row) => a.recommended.radius - b.recommended.radius },
} as const;
type SortKey = keyof typeof SORTS;

export function BubblesTab({ ranked, byId }: { ranked: RankedCapital[]; byId: Map<number, SystemAnalysis> }) {
  const router = useRouter();
  const { planner, setPlanner } = useSettings();
  const [focus, setFocus] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [sort, setSort] = useState<SortKey>("score");
  const [query, setQuery] = useState("");
  const [fullOnly, setFullOnly] = useState(false);
  const [minScore, setMinScore] = useState(0);
  const [maxRisks, setMaxRisks] = useState(8); // 8 = any
  const [excludedRisks, setExcludedRisks] = useState<RiskCode[]>([]);
  const [minColonyLy, setMinColonyLy] = useState(0);
  const open = (r: RankedCapital) => router.push(`/bubble/${r.capitalId64}?size=${r.recommended.size}`);
  const name = (id: number) => byId.get(id)?.system.name ?? String(id);

  const rows: Row[] = useMemo(() => ranked.map((r, i) => ({ ...r, rank: i + 1 })), [ranked]);
  const listed = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = rows.filter(
      (r) =>
        r.recommendedScore >= minScore &&
        (!fullOnly || r.recommended.uncovered.length === 0) &&
        (!q || r.recommended.members.some((m) => name(m).toLowerCase().includes(q))) &&
        (maxRisks >= 8 || r.recommended.riskCodes.length <= maxRisks) &&
        !r.recommended.riskCodes.some((c) => excludedRisks.includes(c)) &&
        (r.recommended.competition.nearestColonyLy === null || r.recommended.competition.nearestColonyLy >= minColonyLy),
    );
    return sort === "score" ? out : [...out].sort(SORTS[sort].fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, minScore, fullOnly, sort, byId, maxRisks, excludedRisks, minColonyLy]);

  const points: MapPoint[] = useMemo(() => {
    if (rows.length === 0) return [];
    const max = rows[0].recommendedScore;
    const min = rows[rows.length - 1].recommendedScore;
    return listed.flatMap((r) => {
      const s = byId.get(r.capitalId64)?.system;
      if (!s) return [];
      const t = (r.recommendedScore - min) / Math.max(1, max - min);
      return [
        {
          id: r.capitalId64,
          name: s.name,
          x: s.x,
          y: s.y,
          z: s.z,
          color: `hsl(${Math.round(20 + t * 110)}, 85%, ${Math.round(32 + t * 28)}%)`,
          info: `#${r.rank} · score ${r.recommendedScore} · ${r.recommended.size} system(s)`,
        },
      ];
    });
  }, [rows, listed, byId]);

  const focused = focus === null ? null : rows.find((r) => r.capitalId64 === focus);
  const bubble: MapBubble | null = useMemo(() => {
    if (!focused) return null;
    return {
      claimRange: planner.claimRange,
      showRanges: false,
      members: focused.recommended.members.flatMap((id, i) => {
        const s = byId.get(id)?.system;
        return s ? [{ id, name: s.name, x: s.x, y: s.y, z: s.z, roles: focused.recommended.assignment[id] ?? [], isCapital: i === 0 }] : [];
      }),
    };
  }, [focused, byId, planner.claimRange]);

  const bridgeText = planner.maxBridges < 0 ? "Any" : planner.maxBridges === 0 ? "Direct only" : `≤ ${planner.maxBridges}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <FilterBar>
        <Input className="h-8 w-52 rounded-full" placeholder="Search system…" value={query} onChange={(e) => setQuery(e.target.value)} />
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
          <p className="mt-2 text-muted-foreground">0 = capitals you can claim directly from the bubble. Re-runs the analysis.</p>
        </FilterPill>
        <FilterPill label="Systems" value={`${planner.sizeMin}–${planner.sizeMax}`}>
          <div className="mb-2 flex justify-between">
            <span className="font-medium">Bubble size</span>
            <span className="text-muted-foreground">
              {planner.sizeMin}–{planner.sizeMax} systems
            </span>
          </div>
          <Slider
            min={1}
            max={12}
            step={1}
            value={[planner.sizeMin, planner.sizeMax]}
            onValueChange={(v) => {
              const [a, b] = v as number[];
              setPlanner({ sizeMin: a, sizeMax: b });
            }}
          />
          <p className="mt-2 text-muted-foreground">Each capital shows its best bubble within this range. Re-runs the analysis.</p>
        </FilterPill>
        <FilterPill label="Roles" value={fullOnly ? "All covered" : "Any"} active={fullOnly}>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={fullOnly} onChange={(e) => setFullOnly(e.target.checked)} />
            Only bubbles covering every target role
          </label>
        </FilterPill>
        <FilterPill label="Score" value={`≥ ${minScore}`} active={minScore > 0}>
          <div className="mb-2 flex justify-between">
            <span className="font-medium">Minimum score</span>
            <span className="text-muted-foreground">{minScore}</span>
          </div>
          <Slider min={0} max={100} step={1} value={[minScore]} onValueChange={(v) => setMinScore(first(v))} />
        </FilterPill>
        <FilterPill
          label="Risks"
          value={
            excludedRisks.length || maxRisks < 8 || minColonyLy > 0
              ? [
                  maxRisks < 8 ? `≤ ${maxRisks}` : null,
                  excludedRisks.length ? `${excludedRisks.length} excluded` : null,
                  minColonyLy > 0 ? `colony ≥ ${minColonyLy} ly` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Any"
          }
          active={excludedRisks.length > 0 || maxRisks < 8 || minColonyLy > 0}
          wide
        >
          <div className="mb-2 flex justify-between">
            <span className="font-medium">Max number of risk types</span>
            <span className="text-muted-foreground">{maxRisks >= 8 ? "any" : maxRisks}</span>
          </div>
          <Slider min={0} max={8} step={1} value={[maxRisks]} onValueChange={(v) => setMaxRisks(first(v))} />
          <div className="mt-3 mb-2 flex justify-between">
            <span className="font-medium">Min distance to nearest other colony</span>
            <span className="text-muted-foreground">{minColonyLy} ly</span>
          </div>
          <Slider min={0} max={30} step={1} value={[minColonyLy]} onValueChange={(v) => setMinColonyLy(first(v))} />
          <p className="mt-1 text-muted-foreground">Measured from every system of the bubble. 15 ly = nobody can claim your neighbours.</p>
          <div className="mt-3 mb-1.5 font-medium">Hide bubbles with…</div>
          <div className="space-y-1">
            {(Object.keys(RISK_LABEL) as RiskCode[]).map((c) => (
              <label key={c} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-muted">
                <input
                  type="checkbox"
                  checked={excludedRisks.includes(c)}
                  onChange={(e) => setExcludedRisks((xs) => (e.target.checked ? [...xs, c] : xs.filter((x) => x !== c)))}
                />
                {RISK_LABEL[c]}
                <span className="ml-auto text-muted-foreground">{rows.filter((r) => r.recommended.riskCodes.includes(c)).length}</span>
              </label>
            ))}
          </div>
          {(excludedRisks.length > 0 || maxRisks < 8 || minColonyLy > 0) && (
            <button
              className="mt-2 underline"
              onClick={() => {
                setExcludedRisks([]);
                setMaxRisks(8);
                setMinColonyLy(0);
              }}
            >
              clear risk filters
            </button>
          )}
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
      </FilterBar>

      <SplitListing
        list={
          <div className="space-y-2">
            <div className="text-[11px] text-muted-foreground">
              <span className="text-sm font-medium text-foreground">{listed.length} bubbles</span> · click a card to see it on the
              map · double-click or Open for details
            </div>
            <CardList
              items={listed}
              getId={(r) => r.capitalId64}
              selectedId={focus}
              empty="No bubble matches your filters."
              renderCard={(r) => {
                const b = r.recommended;
                const roles = [...new Set(Object.values(b.assignment).flat())] as Role[];
                const scores = Object.fromEntries(CRITERIA.map((c) => [c, b.criteria[c].score])) as Record<Criterion, number>;
                const curveMin = Math.min(...r.curve.map((c) => c.score));
                const curveMax = Math.max(...r.curve.map((c) => c.score));
                return (
                  <ListingCard
                    key={r.capitalId64}
                    cardId={r.capitalId64}
                    selected={focus === r.capitalId64}
                    onSelect={() => setFocus(r.capitalId64)}
                    onOpen={() => open(r)}
                    onHover={(on) => setHover(on ? r.capitalId64 : null)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[10px] text-muted-foreground">#{r.rank}</div>
                        <div className="truncate text-sm font-semibold" title={name(r.capitalId64)}>
                          <span className="text-orange-400">★</span> {name(r.capitalId64)}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground" title={b.members.slice(1).map(name).join(", ")}>
                          {b.size === 1 ? "single system" : `+ ${b.members.slice(1).map(name).join(", ")}`}
                        </div>
                      </div>
                      <ScoreBadge score={r.recommendedScore} />
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <Stat label="Systems" value={b.size} />
                      <Stat
                        label="Claim"
                        value={<span className={b.bridgeHops === 0 ? "text-emerald-400" : "text-amber-400"}>{bridgeLabel(b.bridgeHops)}</span>}
                      />
                      <Stat label="Radius" value={`${b.radius.toFixed(0)} ly`} />
                      <Stat
                        label="Market"
                        value={byId.get(r.capitalId64)?.nearestMarket ? `${byId.get(r.capitalId64)!.nearestMarket!.ly.toFixed(0)} ly` : "—"}
                      />
                    </div>
                    <div className="flex min-h-5 flex-wrap gap-1">
                      {ROLES.filter((x) => roles.includes(x)).map((x) => (
                        <RoleChip key={x} role={x} />
                      ))}
                      {b.uncovered.map((x) => (
                        <span key={x} className="rounded border border-dashed px-1 text-[10px] text-muted-foreground line-through">
                          {x}
                        </span>
                      ))}
                    </div>
                    <CompetitionLine c={b.competition} claimRange={planner.claimRange} radius={planner.maxRadius} />
                    <CriteriaBars scores={scores} />
                    {b.riskCodes.length === 0 ? (
                      <div className="text-[11px] text-emerald-400">✓ No risks detected</div>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {b.riskCodes.map((c) => (
                          <span
                            key={c}
                            title={b.risks.join("\n")}
                            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300"
                          >
                            ⚠ {RISK_LABEL[c]}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-end justify-between gap-2 border-t pt-2">
                      <div className="flex h-6 items-end gap-px" title={r.curve.map((c) => `${c.size} systems: ${c.score}`).join("\n")}>
                        {r.curve.map((c) => (
                          <span
                            key={c.size}
                            className={c.size === b.size ? "bg-orange-400" : "bg-muted-foreground/40"}
                            style={{ width: 6, height: `${20 + ((c.score - curveMin) / Math.max(1, curveMax - curveMin)) * 80}%` }}
                          />
                        ))}
                        <span className="ml-1.5 text-[10px] text-muted-foreground">size → score</span>
                      </div>
                      <span className="flex items-center gap-1.5">
                        {byId.get(r.capitalId64) && <AnalyseAreaButton system={byId.get(r.capitalId64)!.system} />}
                        <Button
                          size="xs"
                          className="rounded-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            open(r);
                          }}
                        >
                          Open
                        </Button>
                      </span>
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
            points={points}
            bubble={bubble}
            selectedId={focus}
            highlightId={hover}
            flyDistance={70}
            labelled={rows.slice(0, 5).map((r) => r.capitalId64)}
            onSelect={(id) => setFocus(id)}
            onOpen={(id) => {
              const r = rows.find((x) => x.capitalId64 === id) ?? rows.find((x) => x.recommended.members.includes(id));
              if (r) open(r);
            }}
            overlay={
              <div className="rounded bg-black/70 px-2 py-1 text-[11px] text-zinc-300">
                capitals · bright = better · click to show its bubble · double-click to open
              </div>
            }
          />
        }
      />
    </div>
  );
}
