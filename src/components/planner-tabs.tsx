"use client";

import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { CertaintyTag, ScoreBar, StatusTag } from "@/components/bits";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SystemAnalysis } from "@/lib/engine/bubbles";
import { rankCapitals } from "@/lib/engine/scoring";
import { clearCache } from "@/lib/db";
import { dist, SOL } from "@/lib/geo";
import { ZonesTab } from "./zones-tab";
import { BubblesTab } from "./bubbles-tab";
import { ROLES, type Station } from "@/lib/types";
import { useAnalysis } from "@/store/analysis";
import { useSettings } from "@/store/settings";

const fmt = (n: number | null | undefined, d = 1) => (n === null || n === undefined ? "—" : n.toFixed(d));

export function PlannerTabs() {
  const { result, byId, stations, analysing, analyseError, scan } = useAnalysis();
  const weights = useSettings((s) => s.weights);
  const region = useSettings((s) => s.currentRegion);
  const ranked = useMemo(() => (result ? rankCapitals(result.capitals, weights) : []), [result, weights]);
  const [tab, setTab] = useState<string>(region ? "bubbles" : "zones");

  if (!region && !scan) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
        <p className="text-lg text-foreground">Pick a search area to start</p>
        <p className="max-w-md text-sm">
          Scan the frontier (a distance-from-Sol band) to find the most promising zones, or search around a specific system.
          The planner then downloads every system, body and construction market in the zone and builds the best mini-bubbles.
        </p>
      </div>
    );
  }

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <TabsList>
          <TabsTrigger value="zones">Frontier zones</TabsTrigger>
          <TabsTrigger value="bubbles">Bubbles</TabsTrigger>
          <TabsTrigger value="systems">Systems</TabsTrigger>
          <TabsTrigger value="logistics">Logistics</TabsTrigger>
          <TabsTrigger value="missing">Missing data</TabsTrigger>
          <TabsTrigger value="data">Searches &amp; data</TabsTrigger>
        </TabsList>
        {region && (
          <span className="text-xs text-muted-foreground">
            {region.label} · {region.spheres.length} zone(s)
            {result && ` · ${result.systems.length} systems · ${result.stats.candidates} claimable · ${result.stats.capitalsEvaluated} capitals evaluated in ${result.stats.ms} ms`}
            {analysing && " · analysing…"}
          </span>
        )}
        {analyseError && <span className="text-xs text-red-400">{analyseError}</span>}
      </div>
      <TabsContent value="zones" className="flex min-h-0 flex-col">
        <ZonesTab onAnalysed={() => setTab("bubbles")} />
      </TabsContent>
      <TabsContent value="bubbles" className="flex min-h-0 flex-col">
        {region ? <BubblesTab ranked={ranked} byId={byId} /> : <Empty text="Analyse a frontier zone (or search around a system) to build bubbles." />}
      </TabsContent>
      <TabsContent value="systems" className="min-h-0 overflow-y-auto">
        <SystemsTable systems={result?.systems ?? []} />
      </TabsContent>
      <TabsContent value="logistics" className="min-h-0 overflow-y-auto">
        <LogisticsTable stations={stations} />
      </TabsContent>
      <TabsContent value="missing" className="min-h-0 overflow-y-auto">
        <MissingTable systems={result?.systems ?? []} />
      </TabsContent>
      <TabsContent value="data" className="min-h-0 overflow-y-auto">
        <DataTab />
      </TabsContent>
    </Tabs>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="py-16 text-center text-sm text-muted-foreground">{text}</div>;
}

/* ---------------------------------------------------------------- */

/* ---------------------------------------------------------------- */

const sc = createColumnHelper<SystemAnalysis>();

function SystemsTable({ systems }: { systems: SystemAnalysis[] }) {
  const router = useRouter();
  const verified = useSettings((s) => s.verified);
  const assigned = useSettings((s) => s.assignedRoles);
  const columns = useMemo(
    () => [
      sc.accessor((r) => r.system.name, { id: "name", header: "System", enableHiding: false }),
      sc.accessor("status", { header: "Status", cell: (c) => <StatusTag status={c.getValue()} /> }),
      sc.accessor((r) => dist(r.system, SOL), {
        id: "sol",
        header: "From Sol (ly)",
        cell: (c) => fmt(c.getValue()),
      }),
      ...ROLES.map((role) =>
        sc.accessor((r) => r.roles[role].score, { id: role, header: role, cell: (c) => <ScoreBar value={c.getValue()} /> }),
      ),
      sc.accessor((r) => r.facts.landable, { id: "landable", header: "Landable" }),
      sc.accessor((r) => r.facts.elw, { id: "elw", header: "ELW" }),
      sc.accessor((r) => r.facts.ww, { id: "ww", header: "WW" }),
      sc.accessor((r) => r.facts.aw, { id: "aw", header: "AW" }),
      sc.accessor((r) => r.facts.hmc + r.facts.metalRich, { id: "hmc", header: "HMC/MR" }),
      sc.accessor((r) => r.facts.gasGiants, { id: "gg", header: "Gas giants" }),
      sc.accessor((r) => r.facts.ringedBodies, { id: "rings", header: "Rings" }),
      sc.accessor((r) => r.facts.hotspots, { id: "hotspots", header: "Hotspots" }),
      sc.accessor((r) => r.facts.terraformable, { id: "tf", header: "Terraformable" }),
      sc.accessor((r) => r.facts.bio, { id: "bio", header: "Organics" }),
      sc.accessor((r) => r.facts.geo, { id: "geo", header: "Geologicals" }),
      sc.accessor((r) => r.facts.reserve ?? "", { id: "reserve", header: "Reserve" }),
      sc.accessor((r) => r.facts.mainStar ?? "", { id: "star", header: "Main star" }),
      sc.accessor((r) => r.system.nearestPopulatedDistance, {
        id: "nearestPop",
        header: "Nearest pop. (ly)",
        cell: (c) => fmt(c.getValue()),
      }),
      sc.accessor((r) => r.nearestMarket?.ly ?? null, { id: "market", header: "Market (ly)", cell: (c) => fmt(c.getValue()) }),
      sc.accessor((r) => (assigned[r.system.id64] ?? []).join(", "), { id: "myRole", header: "My role" }),
      sc.accessor((r) => (verified[r.system.id64] ? "✓" : ""), { id: "verified", header: "Verified" }),
      sc.accessor((r) => r.missing.length, { id: "missing", header: "Missing" }),
    ],
    [verified, assigned],
  );
  return (
    <DataTable
      data={systems}
      columns={columns}
      initialSorting={[{ id: "Capital", desc: true }]}
      initialHidden={{ aw: false, tf: false, geo: false, star: false, HighTech: false, Military: false }}
      placeholder="Filter systems…"
      onRowClick={(r) => router.push(`/system/${r.system.id64}`)}
    />
  );
}

/* ---------------------------------------------------------------- */

const stc = createColumnHelper<Station>();

function LogisticsTable({ stations }: { stations: Station[] }) {
  const columns = useMemo(
    () => [
      stc.accessor("name", { header: "Station", enableHiding: false }),
      stc.accessor("systemName", { header: "System" }),
      stc.accessor((s) => dist(s, SOL), {
        id: "sol",
        header: "From Sol (ly)",
        cell: (c) => fmt(c.getValue()),
      }),
      stc.accessor("type", { header: "Type" }),
      stc.accessor("largePads", { header: "L pads" }),
      stc.accessor("mediumPads", { header: "M pads" }),
      stc.accessor((s) => s.distanceToArrival, { id: "arrival", header: "Arrival (ls)", cell: (c) => fmt(c.getValue(), 0) }),
      stc.accessor((s) => Object.keys(s.constructionStock).length, { id: "ncomm", header: "Constr. commodities" }),
      stc.accessor((s) => s.constructionStock.Steel ?? 0, { id: "steel", header: "Steel" }),
      stc.accessor((s) => s.constructionStock.Aluminium ?? 0, { id: "alu", header: "Aluminium" }),
      stc.accessor((s) => s.constructionStock["CMM Composite"] ?? 0, { id: "cmm", header: "CMM" }),
      stc.accessor((s) => s.constructionStock["Ceramic Composites"] ?? 0, { id: "cer", header: "Ceramic" }),
      stc.accessor((s) => (s.systemIsColonised ? "colony" : "bubble"), { id: "origin", header: "Origin" }),
      stc.accessor((s) => s.marketUpdatedAt?.slice(0, 10) ?? "", { id: "updated", header: "Market updated" }),
    ],
    [],
  );
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Stations selling Steel within search radius + haul distance. Stock values are a snapshot <CertaintyTag c="estimated" />.
      </p>
      <DataTable data={stations} columns={columns} initialSorting={[{ id: "sol", desc: false }]} placeholder="Filter stations…" />
    </div>
  );
}

/* ---------------------------------------------------------------- */

function MissingTable({ systems }: { systems: SystemAnalysis[] }) {
  const rows = useMemo(
    () =>
      systems
        .filter((s) => s.claimable && s.missing.length > 0)
        .flatMap((s) => s.missing.map((m) => ({ id64: s.system.id64, name: s.system.name, capital: s.roles.Capital.score, item: m }))),
    [systems],
  );
  const mc = createColumnHelper<(typeof rows)[number]>();
  const columns = [
    mc.accessor("name", {
      header: "System",
      cell: (c) => (
        <Link className="text-orange-300 underline" href={`/system/${c.row.original.id64}`}>
          {c.getValue()}
        </Link>
      ),
    }),
    mc.accessor("item", { header: "Missing / to verify" }),
    mc.accessor("capital", { header: "Capital score" }),
  ];
  return <DataTable data={rows} columns={columns} initialSorting={[{ id: "capital", desc: true }]} placeholder="Filter…" />;
}

/* ---------------------------------------------------------------- */

function DataTab() {
  const s = useSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const exportBackup = () => {
    const data = {
      app: "ed-bubbleplanner",
      version: 1,
      exportedAt: new Date().toISOString(),
      weights: s.weights,
      customProfiles: s.customProfiles,
      planner: s.planner,
      notes: s.notes,
      assignedRoles: s.assignedRoles,
      verified: s.verified,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `bubbleplanner-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Recent searches</h3>
        <ul className="space-y-1 text-xs">
          {s.regionHistory.map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5">
              <span>
                {r.label} · {r.spheres.length} zone(s) ·{" "}
                <span className="text-muted-foreground">{new Date(r.fetchedAt).toLocaleString()}</span>
              </span>
              <Button size="xs" variant="outline" onClick={() => s.setCurrentRegion({ ...r, fetchedAt: Date.now() })}>
                Open
              </Button>
            </li>
          ))}
          {s.regionHistory.length === 0 && <li className="text-muted-foreground">No searches yet</li>}
        </ul>
      </div>
      <div className="space-y-3 text-xs">
        <h3 className="text-sm font-medium">Cache &amp; backup</h3>
        <label className="flex items-center gap-2">
          Re-download regions older than
          <input
            type="number"
            min={1}
            className="h-7 w-16 rounded border bg-background px-1"
            value={s.ttlDays}
            onChange={(e) => s.setTtlDays(Math.max(1, Number(e.target.value)))}
          />
          days
        </label>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={exportBackup}>
            Export notes &amp; settings (JSON)
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            Import backup
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                s.importState(JSON.parse(await f.text()));
                setMsg("Backup imported");
              } catch (err) {
                setMsg(`Import failed: ${(err as Error).message}`);
              }
            }}
          />
          <Button
            size="sm"
            variant="destructive"
            onClick={async () => {
              await clearCache();
              setMsg("Downloaded galaxy data cleared (notes and settings kept)");
            }}
          >
            Clear downloaded data
          </Button>
        </div>
        {msg && <p className="text-muted-foreground">{msg}</p>}
      </div>
    </div>
  );
}
