"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ROLE_COLOR, ROLE_LABEL, ROLES, type Role } from "@/lib/types";
import { useScopedSettings } from "@/store/scoped-settings";

const first = (v: number | readonly number[]) => (Array.isArray(v) ? v[0] : (v as number));

function Row({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">{value}</span>
      </div>
      {children}
    </div>
  );
}

export function BubbleSettingsPanel() {
  const { planner, setPlanner } = useScopedSettings();
  const toggleRole = (r: Role, on: boolean) => {
    const next = on ? [...planner.targetRoles, r] : planner.targetRoles.filter((x) => x !== r);
    setPlanner({ targetRoles: ROLES.filter((x) => next.includes(x)) });
  };

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold">Bubble shape</div>
      <div className="space-y-4">
        <div>
          <div className="mb-2 text-xs text-muted-foreground">Roles the bubble must cover</div>
          <div className="grid grid-cols-2 gap-1.5">
            {ROLES.map((r) => (
              <label key={r} className="flex cursor-pointer items-center gap-2 text-xs">
                <Checkbox
                  checked={planner.targetRoles.includes(r)}
                  disabled={r === "Capital"}
                  onCheckedChange={(c) => toggleRole(r, c === true)}
                />
                <span className="inline-block size-2 rounded-full" style={{ background: ROLE_COLOR[r] }} />
                {ROLE_LABEL[r]}
              </label>
            ))}
          </div>
        </div>

        <Row
          label="Max claim bridges"
          value={planner.maxBridges < 0 ? "any" : planner.maxBridges === 0 ? "0 · direct claim only" : String(planner.maxBridges)}
        >
          <Slider
            min={0}
            max={10}
            step={1}
            value={[planner.maxBridges < 0 ? 10 : planner.maxBridges]}
            onValueChange={(v) => setPlanner({ maxBridges: first(v) >= 10 ? -1 : first(v) })}
          />
          <p className="text-[11px] text-muted-foreground">
            Outposts you&apos;d need to build to reach the capital (claims reach 15 ly from a populated system). 0 = first colony
            from the bubble.
          </p>
        </Row>
        <Row label="Number of systems" value={`${planner.sizeMin} – ${planner.sizeMax}`}>
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
        </Row>
        <Row label="Max hop between members" value={`${planner.maxHop} ly`}>
          <Slider min={5} max={30} step={0.5} value={[planner.maxHop]} onValueChange={(v) => setPlanner({ maxHop: first(v) })} />
        </Row>
        <Row label="Max radius from capital" value={`${planner.maxRadius} ly`}>
          <Slider min={5} max={80} step={1} value={[planner.maxRadius]} onValueChange={(v) => setPlanner({ maxRadius: first(v) })} />
        </Row>
        <Row label="Claim range (game rule)" value={`${planner.claimRange} ly`}>
          <Slider min={10} max={20} step={0.5} value={[planner.claimRange]} onValueChange={(v) => setPlanner({ claimRange: first(v) })} />
        </Row>
        <Row label="Capitals evaluated / search width" value={`${planner.maxCapitals} / ${planner.beamWidth}`}>
          <Slider min={10} max={400} step={10} value={[planner.maxCapitals]} onValueChange={(v) => setPlanner({ maxCapitals: first(v) })} />
          <Slider min={1} max={16} step={1} value={[planner.beamWidth]} onValueChange={(v) => setPlanner({ beamWidth: first(v) })} />
        </Row>
      </div>
    </div>
  );
}

export function LogisticsPanel() {
  const { planner, setLogistics } = useScopedSettings();
  const lg = planner.logistics;
  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold">Hauling</div>
      <div className="space-y-4">
        <label className="flex items-center justify-between text-xs">
          <span>I have a Fleet Carrier</span>
          <Switch checked={lg.hasFleetCarrier} onCheckedChange={(c) => setLogistics({ hasFleetCarrier: c === true })} />
        </label>
        <div className="flex items-center justify-between text-xs">
          <span>Minimum pad at markets</span>
          <div className="flex overflow-hidden rounded-md border">
            {(["L", "M"] as const).map((p) => (
              <button
                key={p}
                type="button"
                className={`px-3 py-1 ${lg.minPad === p ? "bg-primary text-primary-foreground" : ""}`}
                onClick={() => setLogistics({ minPad: p })}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <Row label="Acceptable haul distance" value={`${lg.maxHaulLy} ly${lg.hasFleetCarrier ? " (×5 with FC)" : ""}`}>
          <Slider min={5} max={150} step={5} value={[lg.maxHaulLy]} onValueChange={(v) => setLogistics({ maxHaulLy: first(v) })} />
        </Row>
      </div>
    </div>
  );
}
