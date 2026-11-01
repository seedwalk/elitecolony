"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { CertaintyTag, RoleChip, ScoreBar, StatusTag, useHydrated } from "@/components/bits";
import { DataTable } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/db";
import { ROLE_COVER_THRESHOLD } from "@/lib/engine/roles";
import { ROLES, type Body, type Role } from "@/lib/types";
import { AnalyseAreaButton } from "@/components/analyse-area-button";
import { BackButton } from "@/components/back-button";
import { useAnalysis } from "@/store/analysis";
import { useSettings } from "@/store/settings";

const bc = createColumnHelper<Body>();
const fmt = (n: number | null, d = 2) => (n === null ? "—" : n.toFixed(d));

export default function SystemPageWrapper() {
  return (
    <Suspense>
      <SystemPage />
    </Suspense>
  );
}

function SystemPage() {
  const hydrated = useHydrated();
  const id = Number(useParams<{ id: string }>().id);
  const a = useAnalysis((s) => s.byId.get(id));
  const { notes, setNote, assignedRoles, setAssignedRoles, verified, setVerified } = useSettings();
  const [bodies, setBodies] = useState<Body[] | null>(null);

  useEffect(() => {
    void db.bodies.where("systemId64").equals(id).toArray().then((b) =>
      setBodies(b.sort((x, y) => (x.distanceToArrival ?? 0) - (y.distanceToArrival ?? 0))),
    );
  }, [id]);

  const columns = useMemo(
    () => [
      bc.accessor("name", { header: "Body", enableHiding: false }),
      bc.accessor("subtype", { header: "Type" }),
      bc.accessor("distanceToArrival", { header: "Arrival (ls)", cell: (c) => fmt(c.getValue(), 0) }),
      bc.accessor((b) => (b.isLandable ? "yes" : ""), { id: "landable", header: "Landable" }),
      bc.accessor("gravity", { header: "Gravity (g)", cell: (c) => fmt(c.getValue()) }),
      bc.accessor("atmosphere", { header: "Atmosphere" }),
      bc.accessor("volcanism", { header: "Volcanism" }),
      bc.accessor("terraformingState", { header: "Terraforming" }),
      bc.accessor("bioSignals", { header: "Bio" }),
      bc.accessor("geoSignals", { header: "Geo" }),
      bc.accessor((b) => b.rings.map((r) => `${r.type}${Object.keys(r.hotspots).length ? ` [${Object.entries(r.hotspots).map(([k, v]) => `${k} ${v}`).join(", ")}]` : ""}`).join(" · "), {
        id: "rings",
        header: "Rings & hotspots",
      }),
      bc.accessor((b) => (b.tidallyLocked ? "yes" : ""), { id: "locked", header: "Tidally locked" }),
      bc.accessor("parentType", { header: "Orbits" }),
      bc.accessor("reserveLevel", { header: "Reserve" }),
      bc.accessor((b) => b.updatedAt?.slice(0, 10) ?? "", { id: "updated", header: "Updated" }),
    ],
    [],
  );

  if (!hydrated) return null;
  const mine = assignedRoles[id] ?? [];

  return (
    <div className="space-y-4">
      <div>
        <BackButton />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{a?.system.name ?? `System ${id}`}</h1>
          {a && <AnalyseAreaButton system={a.system} label="Analyse area around this system" />}
        </div>
        {a && (
          <p className="text-sm text-muted-foreground">
            <StatusTag status={a.status} /> · {a.system.x.toFixed(2)}, {a.system.y.toFixed(2)}, {a.system.z.toFixed(2)} · nearest
            populated {a.system.nearestPopulatedDistance?.toFixed(1) ?? "?"} ly · data updated {a.system.updatedAt?.slice(0, 10) ?? "?"} ·{" "}
            <a className="underline" href={`https://spansh.co.uk/system/${id}`} target="_blank" rel="noreferrer">
              Spansh
            </a>
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Role fit</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {a ? (
              ROLES.map((r) => (
                <details key={r}>
                  <summary className="flex cursor-pointer items-center justify-between text-xs">
                    <span className="flex items-center gap-2">
                      <RoleChip role={r} />
                      {a.roles[r].score >= ROLE_COVER_THRESHOLD && <span className="text-emerald-400">viable</span>}
                    </span>
                    <ScoreBar value={a.roles[r].score} />
                  </summary>
                  <ul className="mt-1 space-y-0.5 pl-2 text-[11px] text-muted-foreground">
                    {a.roles[r].reasons.map((x, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span>{x.text}</span>
                        <span className="flex shrink-0 items-center gap-1">
                          {x.points > 0 ? `+${x.points}` : x.points} <CertaintyTag c={x.certainty} />
                        </span>
                      </li>
                    ))}
                    {a.roles[r].reasons.length === 0 && <li>No supporting features</li>}
                  </ul>
                </details>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">Not in the current analysis — open a region that contains it.</p>
            )}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>My notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex flex-wrap gap-1.5">
              {ROLES.map((r) => (
                <label key={r} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={mine.includes(r)}
                    onChange={(e) =>
                      setAssignedRoles(id, e.target.checked ? [...mine, r] : mine.filter((x: Role) => x !== r))
                    }
                  />
                  {r}
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={verified[id] ?? false} onChange={(e) => setVerified(id, e.target.checked)} />
              Verified in game
            </label>
            <Textarea rows={5} placeholder="Notes…" value={notes[id] ?? ""} onChange={(e) => setNote(id, e.target.value)} />
            {a && a.missing.length > 0 && (
              <ul className="list-disc pl-4 text-amber-300">
                {a.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
            {a?.nearestMarket && (
              <p className="text-muted-foreground">
                Nearest construction market: {a.nearestMarket.stationName} ({a.nearestMarket.systemName}) ·{" "}
                {a.nearestMarket.ly.toFixed(1)} ly · {a.nearestMarket.largePads} L pads
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle>All bodies ({bodies?.length ?? "…"}{a?.facts.bodyCount ? ` of ${a.facts.bodyCount}` : ""})</CardTitle>
        </CardHeader>
        <CardContent>
          {bodies && <DataTable data={bodies} columns={columns} pageSize={100} placeholder="Filter bodies…" />}
        </CardContent>
      </Card>
    </div>
  );
}
