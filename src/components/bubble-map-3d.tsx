"use client";

import { Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";
import { ROLE_COLOR, type Role, type Vec3 } from "@/lib/types";

export interface MapMember extends Vec3 {
  id64: number;
  name: string;
  roles: Role[];
  isCapital: boolean;
}

export interface MapContext extends Vec3 {
  id64: number;
  name: string;
  kind: "colony" | "populated" | "market" | "candidate";
}

const CONTEXT_COLOR: Record<MapContext["kind"], string> = {
  colony: "#e11d48",
  populated: "#94a3b8",
  market: "#3b82f6",
  candidate: "#3f3f46",
};

/** ED → three.js: x right, y up, ED +z (toward Sagittarius A*) is "forward" (three −z). */
const P = (p: Vec3, o: Vec3): [number, number, number] => [p.x - o.x, p.y - o.y, -(p.z - o.z)];

export default function BubbleMap3D({
  members,
  context,
  claimRange,
  onSelect,
}: {
  members: MapMember[];
  context: MapContext[];
  claimRange: number;
  onSelect?: (id64: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const hoverLabel = useMemo(() => {
    if (hover === null) return null;
    const m = members.find((x) => x.id64 === hover);
    if (m) return `${m.name} — ${m.roles.join(" + ") || "expansion slot"}`;
    const c = context.find((x) => x.id64 === hover);
    return c ? `${c.name} — ${c.kind}` : null;
  }, [hover, members, context]);
  const [layers, setLayers] = useState({ ranges: true, colony: true, populated: true, market: true, candidate: false });
  const origin = members[0];
  const planeY = useMemo(() => members.reduce((s, m) => s + m.y, 0) / members.length - origin.y, [members, origin]);
  const extent = Math.max(30, ...members.map((m) => Math.hypot(m.x - origin.x, m.y - origin.y, m.z - origin.z) + claimRange));

  // tree edges: connect each member to its nearest earlier member
  const edges = useMemo(() => {
    const out: { a: MapMember; b: MapMember; d: number }[] = [];
    for (let i = 1; i < members.length; i++) {
      let best = members[0];
      let bd = Infinity;
      for (let j = 0; j < i; j++) {
        const d = Math.hypot(members[i].x - members[j].x, members[i].y - members[j].y, members[i].z - members[j].z);
        if (d < bd) {
          bd = d;
          best = members[j];
        }
      }
      out.push({ a: best, b: members[i], d: bd });
    }
    return out;
  }, [members]);

  return (
    <div className="relative h-[460px] w-full overflow-hidden rounded-lg border bg-black">
      <div className="absolute top-2 left-2 z-10 flex flex-wrap gap-2 text-[11px]">
        {(
          [
            ["ranges", "Claim ranges", "#f97316"],
            ["colony", "Other colonies", CONTEXT_COLOR.colony],
            ["populated", "Populated", CONTEXT_COLOR.populated],
            ["market", "L-pad markets", CONTEXT_COLOR.market],
            ["candidate", "Other claimable", "#71717a"],
          ] as const
        ).map(([k, label, color]) => (
          <label key={k} className="flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-zinc-200">
            <input type="checkbox" checked={layers[k]} onChange={(e) => setLayers((l) => ({ ...l, [k]: e.target.checked }))} />
            <span className="inline-block size-2 rounded-full" style={{ background: color }} />
            {label}
          </label>
        ))}
      </div>
      {hoverLabel && (
        <div className="absolute bottom-2 left-2 z-10 rounded bg-black/80 px-2 py-1 text-xs text-zinc-100">{hoverLabel}</div>
      )}
      <div className="absolute right-2 bottom-2 z-10 text-[10px] text-zinc-500">drag: rotate · scroll: zoom · right-drag: pan</div>
      <Canvas camera={{ position: [extent * 0.9, extent * 0.7, extent * 0.9], fov: 50, far: 5000 }}>
        <ambientLight intensity={0.6} />
        <pointLight position={[0, extent, 0]} intensity={1} />
        <OrbitControls makeDefault enableDamping />
        <gridHelper args={[extent * 2.5, 20, "#3f3f46", "#27272a"]} position={[0, planeY, 0]} />

        {edges.map((e, i) => {
          const a = P(e.a, origin);
          const b = P(e.b, origin);
          return (
            <group key={i}>
              <Line points={[a, b]} color="#f97316" lineWidth={2} />
              <Html position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]} center style={{ pointerEvents: "none" }}>
                <span className="rounded bg-black/70 px-1 text-[10px] text-orange-300">{e.d.toFixed(1)} ly</span>
              </Html>
            </group>
          );
        })}

        {members.map((m) => {
          const p = P(m, origin);
          const color = ROLE_COLOR[m.roles[0] ?? (m.isCapital ? "Capital" : "Logistics")];
          return (
            <group key={m.id64}>
              {/* drop line to reference plane, like the in-game galaxy map */}
              <Line points={[p, [p[0], planeY, p[2]]]} color="#52525b" lineWidth={1} dashed dashSize={0.6} gapSize={0.4} />
              <mesh
                position={p}
                onPointerOver={(e) => {
                  e.stopPropagation();
                  setHover(m.id64);
                }}
                onPointerOut={() => setHover(null)}
                onClick={() => onSelect?.(m.id64)}
              >
                <sphereGeometry args={[m.isCapital ? 1.6 : 1.1, 24, 24]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
              </mesh>
              {layers.ranges && (
                <mesh position={p}>
                  <sphereGeometry args={[claimRange, 32, 16]} />
                  <meshBasicMaterial color="#f97316" transparent opacity={0.04} depthWrite={false} />
                </mesh>
              )}
              <Html position={p} style={{ pointerEvents: "none", transform: "translate(8px,-8px)" }}>
                <div className="rounded bg-black/75 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-zinc-100">
                  {m.isCapital && "★ "}
                  {m.name}
                </div>
              </Html>
            </group>
          );
        })}

        {context
          .filter((c) => layers[c.kind])
          .map((c) => {
            const p = P(c, origin);
            return (
              <mesh
                key={`${c.kind}-${c.id64}`}
                position={p}
                onPointerOver={(e) => {
                  e.stopPropagation();
                  setHover(c.id64);
                }}
                onPointerOut={() => setHover(null)}
              >
                {c.kind === "market" ? <boxGeometry args={[1, 1, 1]} /> : <sphereGeometry args={[0.6, 12, 12]} />}
                <meshBasicMaterial color={CONTEXT_COLOR[c.kind]} />
              </mesh>
            );
          })}
      </Canvas>
    </div>
  );
}
