"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { CertaintyTag, RoleChip, useHydrated } from "@/components/bits";
import type { MapBubble, MapPoint } from "@/components/space-map";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CRITERION_COLOR } from "@/components/weights-panel";
import { bridgeLabel } from "@/components/zones-tab";
import { CRITERIA, CRITERION_LABEL, type Bubble, type SystemAnalysis } from "@/lib/engine/bubbles";
import { ROLE_COVER_THRESHOLD } from "@/lib/engine/roles";
import { normalizeWeights, rankCapitals } from "@/lib/engine/scoring";
import { dist } from "@/lib/geo";
import { ROLES, type Role } from "@/lib/types";
import { AnalyseAreaButton } from "@/components/analyse-area-button";
import { BackButton } from "@/components/back-button";
import { CompetitionLine } from "@/components/competition-line";
import { useAnalysis } from "@/store/analysis";
import { useSettings } from "@/store/settings";

const SpaceMap = dynamic(() => import("@/components/space-map"), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse rounded-lg border bg-muted/30" />,
});

const LAYERS = {
  colony: { label: "Other colonies", color: "#e11d48" },
  populated: { label: "Populated", color: "#94a3b8" },
  market: { label: "L-pad markets", color: "#3b82f6" },
  candidate: { label: "Other claimable", color: "#52525b" },
} as const;
type Layer = keyof typeof LAYERS;

export default function BubblePageWrapper() {
  return (
    <Suspense>
      <BubblePage />
    </Suspense>
  );
}

function BubblePage() {
  const hydrated = useHydrated();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const capitalId = Number(params.id);
  const { result, byId, stations, analysing } = useAnalysis();
  const { weights, planner, assignedRoles } = useSettings();
  const [selected, setSelected] = useState<number | null>(null);
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ colony: true, populated: true, market: true, candidate: false });
  const [ranges, setRanges] = useState(true);
  const cardRefs = useRef(new Map<number, HTMLDivElement>());

  const ranked = useMemo(() => (result ? rankCapitals(result.capitals, weights) : []), [result, weights]);
  const rank = ranked.findIndex((r) => r.capitalId64 === capitalId);
  const entry = ranked[rank];
  const size = Number(search.get("size")) || entry?.recommended.size;
  const point = entry?.curve.find((c) => c.size === size) ?? entry?.curve[entry.curve.length - 1];
  const bubble: Bubble | undefined = point?.bubble;

  const mapBubble: MapBubble | null = useMemo(() => {
    if (!bubble) return null;
    return {
      claimRange: planner.claimRange,
      showRanges: ranges,
      members: bubble.members.flatMap((id, i) => {
        const s = byId.get(id)?.system;
        return s ? [{ id, name: s.name, x: s.x, y: s.y, z: s.z, roles: bubble.assignment[id] ?? [], isCapital: i === 0 }] : [];
      }),
    };
  }, [bubble, byId, planner.claimRange, ranges]);

  const context: MapPoint[] = useMemo(() => {
    if (!bubble || !result) return [];
    const cap = byId.get(bubble.members[0])!.system;
    const r = planner.maxRadius + planner.claimRange;
    const members = new Set(bubble.members);
    const out: MapPoint[] = [];
    for (const a of result.systems) {
      if (members.has(a.system.id64) || dist(a.system, cap) > r) continue;
      const kind: Layer =
        a.system.isColonised || a.system.isBeingColonised ? "colony" : a.system.population > 0 ? "populated" : "candidate";
      if (!layers[kind]) continue;
      out.push({ id: a.system.id64, name: a.system.name, x: a.system.x, y: a.system.y, z: a.system.z, color: LAYERS[kind].color, info: a.status });
    }
    if (layers.market) {
      const seen = new Set<number>();
      for (const st of stations) {
        if (st.largePads === 0 || seen.has(st.systemId64) || dist(st, cap) > r + 20) continue;
        seen.add(st.systemId64);
        out.push({
          id: -st.systemId64,
          name: `${st.name} (${st.systemName})`,
          x: st.x,
          y: st.y,
          z: st.z,
          color: LAYERS.market.color,
          size: 1.4,
          info: "L-pad construction market",
        });
      }
    }
    return out;
  }, [bubble, result, byId, stations, planner.maxRadius, planner.claimRange, layers]);

  useEffect(() => {
    if (selected !== null) cardRefs.current.get(selected)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  if (!hydrated) return null;
  if (!result || !entry || !bubble) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        {analysing ? "Analysing region…" : "This bubble isn't in the current analysis."}{" "}
        <Link href="/" className="underline">
          Back to planner
        </Link>
      </div>
    );
  }

  const cap = byId.get(capitalId)!;
  const pct = normalizeWeights(weights);
  const curveMin = Math.min(...entry.curve.map((c) => c.score));
  const curveMax = Math.max(...entry.curve.map((c) => c.score));
  const myCoverage = planner.targetRoles.map((role) => {
    const holder = bubble.members.find((m) => (assignedRoles[m] ?? []).includes(role));
    return { role, holder, score: holder ? byId.get(holder)!.roles[role].score : null };
  });
  const hasMine = myCoverage.some((c) => c.holder !== undefined);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <BackButton />
          <h1 className="truncate text-xl font-semibold">
            <span className="text-orange-400">★</span> {cap.system.name} bubble
          </h1>
          <p className="text-sm text-muted-foreground">
            Rank #{rank + 1} · score <span className="font-medium text-foreground">{point.score}</span> ·{" "}
            {bubble.uncovered.length === 0 ? (
              <span className="text-emerald-400">
                ✅ all {planner.targetRoles.length} roles in {bubble.size} system(s)
              </span>
            ) : (
              <span className="text-amber-400">
                ⚠ {planner.targetRoles.length - bubble.uncovered.length}/{planner.targetRoles.length} roles in {bubble.size} system(s) —
                missing {bubble.uncovered.join(", ")}
              </span>
            )}{" "}
            · claim {bridgeLabel(bubble.bridgeHops)} · max hop {bubble.maxHop.toFixed(1)} ly · radius {bubble.radius.toFixed(1)} ly
          </p>
          <div className="mt-1">
            <CompetitionLine c={bubble.competition} claimRange={planner.claimRange} radius={planner.maxRadius} />
          </div>
        </div>
        <div>
          <div className="mb-1 text-[11px] text-muted-foreground">Best bubble by size (click to switch)</div>
          <div className="flex h-16 items-end gap-1">
            {entry.curve.map((c) => (
              <button
                key={c.size}
                onClick={() => router.replace(`/bubble/${capitalId}?size=${c.size}`)}
                className="group flex w-8 flex-col items-center gap-0.5"
                title={`${c.size} systems: ${c.score}${c.bubble.uncovered.length ? ` (missing ${c.bubble.uncovered.join(", ")})` : ""}`}
              >
                <span className="text-[10px] tabular-nums text-muted-foreground">{Math.round(c.score)}</span>
                <span
                  className={`w-full rounded-t ${c.size === size ? "bg-orange-500" : c.bubble.uncovered.length ? "bg-muted-foreground/30" : "bg-emerald-600/60"} group-hover:opacity-80`}
                  style={{ height: `${6 + ((c.score - curveMin) / Math.max(1, curveMax - curveMin)) * 30}px` }}
                />
                <span className="text-[10px]">{c.size}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-3">
          {mapBubble && (
            <SpaceMap
              className="h-[calc(100vh-470px)] min-h-[340px]"
              centerOn="bubble"
              points={context}
              bubble={mapBubble}
              selectedId={selected}
              flyDistance={65}
              onSelect={(id) => setSelected(id)}
              onOpen={(id) => id > 0 && router.push(`/system/${id}`)}
              overlay={
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <label className="flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-zinc-200">
                    <input type="checkbox" checked={ranges} onChange={(e) => setRanges(e.target.checked)} />
                    <span className="inline-block size-2 rounded-full bg-orange-500" />
                    Claim ranges
                  </label>
                  {(Object.keys(LAYERS) as Layer[]).map((k) => (
                    <label key={k} className="flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-zinc-200">
                      <input type="checkbox" checked={layers[k]} onChange={(e) => setLayers((l) => ({ ...l, [k]: e.target.checked }))} />
                      <span className="inline-block size-2 rounded-full" style={{ background: LAYERS[k].color }} />
                      {LAYERS[k].label}
                    </label>
                  ))}
                </div>
              }
            />
          )}

          <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
            {bubble.members.map((id, i) => (
              <MemberCard
                key={id}
                cardRef={(el) => {
                  if (el) cardRefs.current.set(id, el);
                  else cardRefs.current.delete(id);
                }}
                a={byId.get(id)!}
                isCapital={i === 0}
                suggested={bubble.assignment[id] ?? []}
                toCapital={i === 0 ? null : dist(byId.get(id)!.system, cap.system)}
                selected={selected === id}
                onSelect={() => setSelected(id)}
                onOpen={() => router.push(`/system/${id}`)}
              />
            ))}
          </div>
        </div>

        <div className="space-y-3 xl:sticky xl:top-16 xl:max-h-[calc(100vh-80px)] xl:overflow-y-auto">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Score breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {CRITERIA.map((k) => {
                const c = bubble.criteria[k];
                return (
                  <details key={k}>
                    <summary className="flex cursor-pointer items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block size-2 rounded-full" style={{ background: CRITERION_COLOR[k] }} />
                        {CRITERION_LABEL[k]} <span className="text-muted-foreground">({pct[k].toFixed(0)}%)</span>
                      </span>
                      <span className="font-medium tabular-nums">{c.score}</span>
                    </summary>
                    <ul className="mt-1 space-y-0.5 pl-3.5 text-[11px] text-muted-foreground">
                      {c.reasons.map((r, i) => (
                        <li key={i} className="flex items-center justify-between gap-2">
                          <span>{r.text}</span>
                          <span className="flex shrink-0 items-center gap-1">
                            <span className="tabular-nums">{r.points > 0 ? `+${r.points}` : r.points}</span>
                            <CertaintyTag c={r.certainty} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })}
            </CardContent>
          </Card>
          {hasMine && (
            <Card size="sm">
              <CardHeader>
                <CardTitle>Your role assignment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-0.5 text-xs">
                {myCoverage.map((c) => (
                  <div key={c.role} className={c.score !== null && c.score >= ROLE_COVER_THRESHOLD ? "text-emerald-400" : "text-amber-400"}>
                    {c.role}: {c.holder ? `${byId.get(c.holder)!.system.name} (${c.score})` : "unassigned"}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          <ListCard title="Advantages" items={bubble.advantages} />
          <ListCard title="Risks" items={bubble.risks} tone="text-amber-300" />
          <ListCard
            title="Missing data / verify in game"
            items={[...bubble.missing, "Construction slots and CP costs are not available from any API"]}
            tone="text-muted-foreground"
          />
        </div>
      </div>
    </div>
  );
}

function ListCard({ title, items, tone = "" }: { title: string; items: string[]; tone?: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className={`list-disc space-y-1 pl-4 text-xs ${tone}`}>
          {items.map((a) => (
            <li key={a}>{a}</li>
          ))}
          {items.length === 0 && <li className="text-muted-foreground">None detected</li>}
        </ul>
      </CardContent>
    </Card>
  );
}

const STAT_ICONS: { key: string; label: string; color: string; get: (a: SystemAnalysis) => number }[] = [
  { key: "elw", label: "ELW", color: "#22c55e", get: (a) => a.facts.elw },
  { key: "ww", label: "WW", color: "#06b6d4", get: (a) => a.facts.ww },
  { key: "aw", label: "AW", color: "#a855f7", get: (a) => a.facts.aw },
  { key: "cs", label: "BH/NS/WD", color: "#c084fc", get: (a) => a.facts.blackHoles + a.facts.neutronStars + a.facts.whiteDwarfs },
  { key: "hmc", label: "HMC/MR", color: "#ef4444", get: (a) => a.facts.hmc + a.facts.metalRich },
  { key: "gg", label: "Gas giants", color: "#eab308", get: (a) => a.facts.gasGiants },
  { key: "rings", label: "Rings", color: "#f97316", get: (a) => a.facts.ringedBodies },
  { key: "hot", label: "Hotspots", color: "#fb923c", get: (a) => a.facts.hotspots },
  { key: "land", label: "Landable", color: "#a1a1aa", get: (a) => a.facts.landable },
  { key: "bio", label: "Organics", color: "#4ade80", get: (a) => a.facts.bio },
  { key: "geo", label: "Geo", color: "#f87171", get: (a) => a.facts.geo },
  { key: "tf", label: "Terraform.", color: "#86efac", get: (a) => a.facts.terraformable },
];

function MemberCard({
  cardRef,
  a,
  isCapital,
  suggested,
  toCapital,
  selected,
  onSelect,
  onOpen,
}: {
  cardRef: (el: HTMLDivElement | null) => void;
  a: SystemAnalysis;
  isCapital: boolean;
  suggested: Role[];
  toCapital: number | null;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const { assignedRoles, setAssignedRoles } = useSettings();
  const mine = assignedRoles[a.system.id64] ?? [];
  const f = a.facts;
  const hotspotTitle = Object.entries(f.hotspotTypes)
    .map(([k, v]) => `${k} ×${v}`)
    .join(", ");

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      className={`flex cursor-pointer flex-col gap-2 rounded-xl border bg-card p-3 text-xs transition-colors ${selected ? "border-orange-500 ring-1 ring-orange-500/50" : "hover:border-foreground/30"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium" title={a.system.name}>
            {isCapital && <span className="text-orange-400">★ </span>}
            {a.system.name}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {toCapital === null ? "Capital" : `${toCapital.toFixed(1)} ly to capital`} ·{" "}
            <span className={a.status === "Available" ? "text-emerald-400" : "text-amber-400"}>{a.status}</span>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-0.5">
          {suggested.map((r) => (
            <RoleChip key={r} role={r} />
          ))}
          {suggested.length === 0 && <span className="text-[10px] text-muted-foreground">expansion slot</span>}
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {STAT_ICONS.map((s) => {
          const n = s.get(a);
          if (n === 0) return null;
          return (
            <span
              key={s.key}
              title={s.key === "hot" ? hotspotTitle : s.label}
              className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5"
            >
              <span className="inline-block size-2 rotate-45" style={{ background: s.color }} />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="font-medium tabular-nums">{n}</span>
            </span>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-1 text-[11px]">
        <div>
          <div className="text-muted-foreground">Reserve</div>
          <div>{f.reserve ?? "?"}</div>
        </div>
        <div className="min-w-0">
          <div className="text-muted-foreground">Main star</div>
          <div className="truncate" title={f.mainStar ?? ""}>
            {f.mainStar?.replace(/ Star$/, "") ?? "?"}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Market</div>
          <div>{a.nearestMarket ? `${a.nearestMarket.ly.toFixed(0)} ly` : "—"}</div>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
        <select
          className="rounded border bg-background px-1 py-0.5 text-[11px]"
          value={mine[0] ?? ""}
          onChange={(e) => setAssignedRoles(a.system.id64, e.target.value ? [e.target.value as Role] : [])}
          title="My role for this system"
        >
          <option value="">My role…</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r} ({a.roles[r].score})
            </option>
          ))}
        </select>
        <span className="flex items-center gap-2">
          <AnalyseAreaButton system={a.system} label="Analyse" />
          <Link href={`/system/${a.system.id64}`} className="text-orange-300 hover:underline">
            Details →
          </Link>
        </span>
      </div>
    </div>
  );
}
