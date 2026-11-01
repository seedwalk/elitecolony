"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { CertaintyTag, RoleChip, StatusTag, useHydrated } from "@/components/bits";
import type { MapContext, MapMember } from "@/components/bubble-map-3d";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CRITERION_COLOR } from "@/components/weights-panel";
import { CRITERIA, CRITERION_LABEL, type Bubble } from "@/lib/engine/bubbles";
import { ROLE_COVER_THRESHOLD } from "@/lib/engine/roles";
import { normalizeWeights, rankCapitals } from "@/lib/engine/scoring";
import { dist } from "@/lib/geo";
import { ROLES, type Role } from "@/lib/types";
import { useAnalysis } from "@/store/analysis";
import { useSettings } from "@/store/settings";

const BubbleMap3D = dynamic(() => import("@/components/bubble-map-3d"), {
  ssr: false,
  loading: () => <div className="h-[460px] animate-pulse rounded-lg border bg-muted/30" />,
});

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
  const { weights, planner, assignedRoles, setAssignedRoles } = useSettings();

  const ranked = useMemo(() => (result ? rankCapitals(result.capitals, weights) : []), [result, weights]);
  const rank = ranked.findIndex((r) => r.capitalId64 === capitalId);
  const entry = ranked[rank];
  const size = Number(search.get("size")) || entry?.recommended.size;
  const point = entry?.curve.find((c) => c.size === size) ?? entry?.curve[entry.curve.length - 1];
  const bubble: Bubble | undefined = point?.bubble;

  const mapData = useMemo(() => {
    if (!bubble || !result) return null;
    const members: MapMember[] = bubble.members.map((id, i) => {
      const s = byId.get(id)!.system;
      return { id64: id, name: s.name, x: s.x, y: s.y, z: s.z, roles: bubble.assignment[id] ?? [], isCapital: i === 0 };
    });
    const cap = members[0];
    const r = planner.maxRadius + planner.claimRange;
    const memberSet = new Set(bubble.members);
    const context: MapContext[] = [];
    for (const a of result.systems) {
      if (memberSet.has(a.system.id64) || dist(a.system, cap) > r) continue;
      const kind: MapContext["kind"] =
        a.system.isColonised || a.system.isBeingColonised ? "colony" : a.system.population > 0 ? "populated" : "candidate";
      context.push({ id64: a.system.id64, name: a.system.name, x: a.system.x, y: a.system.y, z: a.system.z, kind });
    }
    const seen = new Set<number>();
    for (const st of stations) {
      if (st.largePads === 0 || seen.has(st.systemId64) || dist(st, cap) > r + 20) continue;
      seen.add(st.systemId64);
      context.push({ id64: st.systemId64, name: `${st.name} (${st.systemName})`, x: st.x, y: st.y, z: st.z, kind: "market" });
    }
    return { members, context };
  }, [bubble, result, byId, stations, planner.maxRadius, planner.claimRange]);

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
  const curveMin = Math.min(...entry.curve.map((c) => c.score));
  const curveMax = Math.max(...entry.curve.map((c) => c.score));
  const pct = normalizeWeights(weights);

  // "My assignment": roles the user assigned to members, scored with the member's role score.
  const myCoverage = planner.targetRoles.map((role) => {
    const holder = bubble.members.find((m) => (assignedRoles[m] ?? []).includes(role));
    return { role, holder, score: holder ? byId.get(holder)!.roles[role].score : null };
  });
  const hasMine = myCoverage.some((c) => c.holder !== undefined);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/" className="text-xs text-muted-foreground hover:underline">
            ← Planner
          </Link>
          <h1 className="text-2xl font-semibold">
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
                ⚠ {planner.targetRoles.length - bubble.uncovered.length}/{planner.targetRoles.length} roles in {bubble.size} system(s) — missing{" "}
                {bubble.uncovered.join(", ")}
              </span>
            )}{" "}
            · max hop {bubble.maxHop.toFixed(1)} ly · radius {bubble.radius.toFixed(1)} ly · avg to capital{" "}
            {bubble.avgToCapital.toFixed(1)} ly
          </p>
        </div>
        {/* size ↔ score curve */}
        <div>
          <div className="mb-1 text-xs text-muted-foreground">Best bubble by size (click to switch)</div>
          <div className="flex h-24 items-end gap-1">
            {entry.curve.map((c) => (
              <button
                key={c.size}
                onClick={() => router.replace(`/bubble/${capitalId}?size=${c.size}`)}
                className="group flex w-9 flex-col items-center gap-0.5"
                title={`${c.size} systems: ${c.score}${c.bubble.uncovered.length ? ` (missing ${c.bubble.uncovered.join(", ")})` : ""}`}
              >
                <span className="text-[10px] tabular-nums text-muted-foreground">{Math.round(c.score)}</span>
                <span
                  className={`w-full rounded-t ${c.size === size ? "bg-orange-500" : c.bubble.uncovered.length ? "bg-muted-foreground/30" : "bg-emerald-600/60"} group-hover:opacity-80`}
                  style={{ height: `${8 + ((c.score - curveMin) / Math.max(1, curveMax - curveMin)) * 52}px` }}
                />
                <span className="text-[10px]">{c.size}</span>
              </button>
            ))}
          </div>
          {entry.recommended.size === size && <div className="text-[10px] text-orange-300">recommended size</div>}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          {mapData && (
            <BubbleMap3D
              members={mapData.members}
              context={mapData.context}
              claimRange={planner.claimRange}
              onSelect={(id) => router.push(`/system/${id}`)}
            />
          )}

          <Card size="sm">
            <CardHeader>
              <CardTitle>Members side by side</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    {["System", "Suggested", "My role", "To capital", "Status", "Landable", "ELW", "WW", "AW", "HMC/MR", "Gas g.", "Rings", "Hotspots", "Organics", "Reserve", "Main star", "Market"].map((h) => (
                      <th key={h} className="px-1.5 py-1 font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bubble.members.map((id, i) => {
                    const a = byId.get(id)!;
                    const f = a.facts;
                    const mine = assignedRoles[id] ?? [];
                    return (
                      <tr key={id} className="border-t align-top">
                        <td className="px-1.5 py-1 whitespace-nowrap">
                          <Link href={`/system/${id}`} className="text-orange-300 hover:underline">
                            {i === 0 && "★ "}
                            {a.system.name}
                          </Link>
                        </td>
                        <td className="px-1.5 py-1">
                          <span className="flex flex-wrap gap-0.5">
                            {(bubble.assignment[id] ?? []).map((r) => (
                              <RoleChip key={r} role={r} />
                            ))}
                            {(bubble.assignment[id] ?? []).length === 0 && (
                              <span className="text-[10px] text-muted-foreground" title="Adds reach / spare slots; strongest at no target role">
                                expansion slot
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-1.5 py-1">
                          <select
                            className="rounded border bg-background px-1 py-0.5 text-[11px]"
                            value={mine[0] ?? ""}
                            onChange={(e) => setAssignedRoles(id, e.target.value ? [e.target.value as Role] : [])}
                          >
                            <option value="">—</option>
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r} ({a.roles[r].score})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-1.5 py-1 tabular-nums">{i === 0 ? "—" : `${dist(a.system, cap.system).toFixed(1)} ly`}</td>
                        <td className="px-1.5 py-1"><StatusTag status={a.status} /></td>
                        <td className="px-1.5 py-1">{f.landable}</td>
                        <td className="px-1.5 py-1">{f.elw}</td>
                        <td className="px-1.5 py-1">{f.ww}</td>
                        <td className="px-1.5 py-1">{f.aw}</td>
                        <td className="px-1.5 py-1">{f.hmc + f.metalRich}</td>
                        <td className="px-1.5 py-1">{f.gasGiants}</td>
                        <td className="px-1.5 py-1">{f.ringedBodies}</td>
                        <td className="px-1.5 py-1" title={Object.entries(f.hotspotTypes).map(([k, v]) => `${k} ×${v}`).join(", ")}>
                          {f.hotspots}
                        </td>
                        <td className="px-1.5 py-1">{f.bio}</td>
                        <td className="px-1.5 py-1">{f.reserve ?? "?"}</td>
                        <td className="px-1.5 py-1 whitespace-nowrap">{f.mainStar ?? "?"}</td>
                        <td className="px-1.5 py-1 whitespace-nowrap">{a.nearestMarket ? `${a.nearestMarket.ly.toFixed(0)} ly` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {hasMine && (
                <div className="mt-3 rounded border p-2 text-xs">
                  <div className="mb-1 font-medium">Your role assignment</div>
                  <div className="flex flex-wrap gap-2">
                    {myCoverage.map((c) => (
                      <span key={c.role} className={c.score !== null && c.score >= ROLE_COVER_THRESHOLD ? "text-emerald-400" : "text-amber-400"}>
                        {c.role}: {c.holder ? `${byId.get(c.holder)!.system.name} (${c.score})` : "unassigned"}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Score breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {CRITERIA.map((k) => {
                const c = bubble.criteria[k];
                return (
                  <details key={k} className="group">
                    <summary className="flex cursor-pointer items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block size-2 rounded-full" style={{ background: CRITERION_COLOR[k] }} />
                        {CRITERION_LABEL[k]} <span className="text-muted-foreground">({pct[k].toFixed(0)}% weight)</span>
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
          <Card size="sm">
            <CardHeader>
              <CardTitle>Advantages</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-4 text-xs">
                {bubble.advantages.map((a) => (
                  <li key={a}>{a}</li>
                ))}
                {bubble.advantages.length === 0 && <li className="text-muted-foreground">None detected</li>}
              </ul>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Risks</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-4 text-xs text-amber-300">
                {bubble.risks.map((a) => (
                  <li key={a}>{a}</li>
                ))}
                {bubble.risks.length === 0 && <li className="text-muted-foreground">None detected</li>}
              </ul>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Missing data / verify in game</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                {bubble.missing.map((a) => (
                  <li key={a}>{a}</li>
                ))}
                <li>Construction slots and CP costs are not available from any API</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
