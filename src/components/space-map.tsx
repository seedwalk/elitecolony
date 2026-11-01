"use client";

import { CameraControls, Html, Line } from "@react-three/drei";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { ROLE_COLOR, type Role, type Vec3 } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface MapPoint extends Vec3 {
  id: number;
  name: string;
  color: string;
  /** Relative size multiplier (1 = default). */
  size?: number;
  /** Small text shown on hover. */
  info?: string;
}

export interface MapMember extends Vec3 {
  id: number;
  name: string;
  roles: Role[];
  isCapital: boolean;
}

export interface MapBubble {
  members: MapMember[];
  claimRange: number;
  showRanges?: boolean;
}

export interface SpaceMapProps {
  points: MapPoint[];
  bubble?: MapBubble | null;
  /** Ids that get a ring highlight (e.g. zones ticked for analysis). */
  marked?: Set<number>;
  /** Ids that get a permanent label. Keep it short (labels are DOM nodes). */
  labelled?: number[];
  selectedId?: number | null;
  /** Highlighted without moving the camera (e.g. hovering a card). */
  highlightId?: number | null;
  onSelect?: (id: number, opts: { shift: boolean }) => void;
  onOpen?: (id: number) => void;
  /** Camera distance (ly) when flying to a selected item. */
  flyDistance?: number;
  showSol?: boolean;
  /** "bubble": scene centred on the bubble capital (detail page); "data": centred on all points (lists). */
  centerOn?: "bubble" | "data";
  className?: string;
  overlay?: ReactNode;
}

/** ED → three.js: x right, y up, ED +z (toward Sagittarius A*) is "forward" (three −z). */
const toThree = (p: Vec3, o: Vec3): [number, number, number] => [p.x - o.x, p.y - o.y, -(p.z - o.z)];

/* ------------------------------------------------------------------ */
/* Point cloud (thousands of systems), constant pixel size              */
/* ------------------------------------------------------------------ */

let dotTexture: THREE.Texture | null = null;
function getDotTexture() {
  if (dotTexture) return dotTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.beginPath();
  g.arc(32, 32, 28, 0, Math.PI * 2);
  g.fillStyle = "#fff";
  g.fill();
  dotTexture = new THREE.CanvasTexture(c);
  return dotTexture;
}

function Points({
  points,
  origin,
  pixelSize,
  onHover,
  onSelect,
  onOpen,
}: {
  points: MapPoint[];
  origin: Vec3;
  pixelSize: number;
  onHover: (p: MapPoint | null) => void;
  onSelect?: SpaceMapProps["onSelect"];
  onOpen?: SpaceMapProps["onOpen"];
}) {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(points.length * 3);
    const col = new Float32Array(points.length * 3);
    const c = new THREE.Color();
    points.forEach((p, i) => {
      const [x, y, z] = toThree(p, origin);
      pos.set([x, y, z], i * 3);
      c.set(p.color);
      col.set([c.r, c.g, c.b], i * 3);
    });
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    return g;
  }, [points, origin]);
  useEffect(() => () => geom.dispose(), [geom]);

  // Hit tolerance follows the zoom so a constant-size dot stays clickable.
  useFrame((state) => {
    const ctrl = state.controls as unknown as CameraControls | null;
    const target = ctrl?.getTarget?.(new THREE.Vector3());
    const d = target ? state.camera.position.distanceTo(target) : 100;
    state.raycaster.params.Points = { threshold: Math.max(0.3, d * 0.012) };
  });

  if (points.length === 0) return null;
  const pick = (e: ThreeEvent<MouseEvent | PointerEvent>) => (e.index !== undefined ? points[e.index] : undefined);

  return (
    <points
      geometry={geom}
      onPointerMove={(e) => {
        e.stopPropagation();
        onHover(pick(e) ?? null);
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        const p = pick(e);
        if (p) onSelect?.(p.id, { shift: e.nativeEvent.shiftKey });
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        const p = pick(e);
        if (p) onOpen?.(p.id);
      }}
    >
      <pointsMaterial
        size={pixelSize}
        sizeAttenuation={false}
        vertexColors
        map={getDotTexture()}
        alphaTest={0.5}
        transparent
        toneMapped={false}
      />
    </points>
  );
}

/* ------------------------------------------------------------------ */
/* Bubble overlay                                                      */
/* ------------------------------------------------------------------ */

function BubbleOverlay({
  bubble,
  origin,
  selectedId,
  onSelect,
  onOpen,
  onHover,
}: {
  bubble: MapBubble;
  origin: Vec3;
  selectedId?: number | null;
  /** Highlighted without moving the camera (e.g. hovering a card). */
  highlightId?: number | null;
  onSelect?: SpaceMapProps["onSelect"];
  onOpen?: SpaceMapProps["onOpen"];
  onHover: (label: string | null) => void;
}) {
  const { members, claimRange } = bubble;
  const planeY = useMemo(() => members.reduce((s, m) => s + m.y, 0) / members.length - origin.y, [members, origin]);
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
    <group>
      {edges.map((e, i) => {
        const a = toThree(e.a, origin);
        const b = toThree(e.b, origin);
        return (
          <group key={i}>
            <Line points={[a, b]} color="#f97316" lineWidth={2} />
            <Html position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]} center style={{ pointerEvents: "none" }}>
              <span className="rounded bg-black/70 px-1 text-[10px] whitespace-nowrap text-orange-300">{e.d.toFixed(1)} ly</span>
            </Html>
          </group>
        );
      })}
      {members.map((m) => {
        const p = toThree(m, origin);
        const color = ROLE_COLOR[m.roles[0] ?? (m.isCapital ? "Capital" : "Logistics")];
        const sel = m.id === selectedId;
        return (
          <group key={m.id}>
            <Line points={[p, [p[0], planeY, p[2]]]} color="#52525b" lineWidth={1} dashed dashSize={0.6} gapSize={0.4} />
            <mesh
              position={p}
              onPointerOver={(e) => {
                e.stopPropagation();
                onHover(`${m.name} — ${m.roles.join(" + ") || "expansion slot"}`);
              }}
              onPointerOut={() => onHover(null)}
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(m.id, { shift: e.nativeEvent.shiftKey });
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onOpen?.(m.id);
              }}
            >
              <sphereGeometry args={[m.isCapital ? 1.6 : 1.1, 24, 24]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={sel ? 1.2 : 0.6} />
            </mesh>
            {bubble.showRanges !== false && (
              <mesh position={p}>
                <sphereGeometry args={[claimRange, 32, 16]} />
                <meshBasicMaterial color="#f97316" transparent opacity={0.04} depthWrite={false} />
              </mesh>
            )}
            <Html position={p} style={{ pointerEvents: "none", transform: "translate(8px,-8px)" }}>
              <div
                className={`rounded px-1.5 py-0.5 text-[11px] whitespace-nowrap ${sel ? "bg-orange-500 text-black" : "bg-black/75 text-zinc-100"}`}
              >
                {m.isCapital && "★ "}
                {m.name}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export default function SpaceMap({
  points,
  bubble,
  marked,
  labelled = [],
  selectedId,
  highlightId,
  onSelect,
  onOpen,
  flyDistance = 60,
  showSol = false,
  centerOn = "bubble",
  className = "h-[520px]",
  overlay,
}: SpaceMapProps) {
  const controls = useRef<CameraControls>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | null>(null);

  // Everything is drawn relative to this origin to keep float precision at ~1000 ly.
  const byBubble = centerOn === "bubble" && !!bubble?.members.length;
  const all: Vec3[] = useMemo(
    () => (byBubble ? [...points, ...(bubble?.members ?? [])] : points.length ? points : (bubble?.members ?? [])),
    [points, bubble, byBubble],
  );
  const origin = useMemo<Vec3>(() => {
    if (byBubble && bubble) return { x: bubble.members[0].x, y: bubble.members[0].y, z: bubble.members[0].z };
    if (all.length === 0) return { x: 0, y: 0, z: 0 };
    const xs = all.map((p) => p.x);
    const ys = all.map((p) => p.y);
    const zs = all.map((p) => p.z);
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
      z: (Math.min(...zs) + Math.max(...zs)) / 2,
    };
  }, [all, bubble, byBubble]);
  const extent = useMemo(() => {
    let r = 20;
    for (const p of all) r = Math.max(r, Math.hypot(p.x - origin.x, p.y - origin.y, p.z - origin.z));
    return r;
  }, [all, origin]);
  // Points stay visible at any scale: ~1/400 of the scene, min 0.5 ly.
  const baseSize = Math.max(0.5, extent / 400);

  const fit = (smooth = true) => {
    void controls.current?.fitToSphere(new THREE.Sphere(new THREE.Vector3(0, 0, 0), extent * 1.05), smooth);
  };

  // Fit when the dataset changes.
  const dataKey = `${points.length}:${byBubble ? (bubble?.members.map((m) => m.id).join(",") ?? "") : ""}:${origin.x.toFixed(1)}`;
  useEffect(() => {
    const t = setTimeout(() => fit(false), 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

  // Fly to the selected item.
  const selected = useMemo(() => {
    if (selectedId == null) return null;
    return points.find((p) => p.id === selectedId) ?? bubble?.members.find((m) => m.id === selectedId) ?? null;
  }, [selectedId, points, bubble]);
  useEffect(() => {
    const c = controls.current;
    if (!c || !selected) return;
    const [tx, ty, tz] = toThree(selected, origin);
    const pos = new THREE.Vector3();
    const tgt = new THREE.Vector3();
    c.getPosition(pos);
    c.getTarget(tgt);
    const dir = pos.sub(tgt).normalize().multiplyScalar(flyDistance);
    void c.setLookAt(tx + dir.x, ty + dir.y, tz + dir.z, tx, ty, tz, true);
  }, [selected, origin, flyDistance]);

  const highlighted = useMemo(
    () => (highlightId == null || highlightId === selectedId ? null : (points.find((p) => p.id === highlightId) ?? null)),
    [highlightId, selectedId, points],
  );
  const labelPoints = useMemo(() => {
    const ids = new Set(labelled);
    if (selectedId != null) ids.add(selectedId);
    if (highlightId != null) ids.add(highlightId);
    return points.filter((p) => ids.has(p.id)).slice(0, 40);
  }, [labelled, selectedId, highlightId, points]);
  const markedPoints = useMemo(() => (marked ? points.filter((p) => marked.has(p.id)) : []), [marked, points]);

  const btn = "flex h-7 min-w-7 items-center justify-center rounded bg-black/70 px-2 text-xs text-zinc-200 hover:bg-zinc-700";

  return (
    <div ref={wrapRef} className={`relative w-full overflow-hidden rounded-lg border bg-black ${className}`}>
      {overlay && <div className="absolute top-2 left-2 z-10">{overlay}</div>}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        <button className={btn} title="Zoom in" onClick={() => void controls.current?.dolly(extent * 0.25, true)}>
          +
        </button>
        <button className={btn} title="Zoom out" onClick={() => void controls.current?.dolly(-extent * 0.25, true)}>
          −
        </button>
        <button className={btn} title="Fit all" onClick={() => fit()}>
          ⤢
        </button>
        <button className={btn} title="Top view" onClick={() => void controls.current?.rotateTo(0, 0.0001, true)}>
          Top
        </button>
        <button className={btn} title="Side view" onClick={() => void controls.current?.rotateTo(0, Math.PI / 2, true)}>
          Side
        </button>
        <button
          className={btn}
          title="Fullscreen"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void wrapRef.current?.requestFullscreen();
          }}
        >
          ⛶
        </button>
      </div>
      {hover && (
        <div className="pointer-events-none absolute bottom-2 left-2 z-10 rounded bg-black/80 px-2 py-1 text-xs text-zinc-100">{hover}</div>
      )}
      <div className="pointer-events-none absolute right-2 bottom-2 z-10 text-[10px] text-zinc-500">
        drag: rotate · right-drag: pan · scroll: zoom · click: select · double-click: open
      </div>

      <Canvas camera={{ position: [extent, extent * 0.8, extent], fov: 50, near: 0.1, far: 100000 }} onPointerMissed={() => setHover(null)}>
        <ambientLight intensity={0.7} />
        <pointLight position={[0, extent, 0]} intensity={1} />
        <CameraControls ref={controls} makeDefault minDistance={2} maxDistance={extent * 8} dollyToCursor />
        <gridHelper
          args={[extent * 2.5, 24, "#3f3f46", "#1f1f23"]}
          position={[0, byBubble ? 0 : -origin.y, 0]}
        />

        <Points
          points={points}
          origin={origin}
          pixelSize={byBubble ? 7 : 5}
          onHover={(p) => setHover(p ? `${p.name}${p.info ? ` — ${p.info}` : ""}` : null)}
          onSelect={onSelect}
          onOpen={onOpen}
        />

        {markedPoints.map((p) => (
          <mesh key={`m${p.id}`} position={toThree(p, origin)}>
            <sphereGeometry args={[(byBubble ? 0.8 : baseSize) * 1.6, 16, 16]} />
            <meshBasicMaterial color="#fb923c" wireframe />
          </mesh>
        ))}

        {selected && !bubble?.members.some((m) => m.id === selectedId) && (
          <mesh position={toThree(selected, origin)}>
            <sphereGeometry args={[(byBubble ? 0.8 : baseSize) * 2.2, 16, 16]} />
            <meshBasicMaterial color="#ffffff" wireframe />
          </mesh>
        )}

        {highlighted && (
          <mesh position={toThree(highlighted, origin)}>
            <sphereGeometry args={[(byBubble ? 0.8 : baseSize) * 2.2, 16, 16]} />
            <meshBasicMaterial color="#fde68a" wireframe />
          </mesh>
        )}

        {labelPoints.map((p) => (
          <Html key={`l${p.id}`} position={toThree(p, origin)} style={{ pointerEvents: "none", transform: "translate(8px,-8px)" }}>
            <div
              className={`rounded px-1.5 py-0.5 text-[11px] whitespace-nowrap ${p.id === selectedId ? "bg-orange-500 text-black" : "bg-black/75 text-zinc-100"}`}
            >
              {p.name}
            </div>
          </Html>
        ))}

        {showSol && (
          <group position={toThree({ x: 0, y: 0, z: 0 }, origin)}>
            <mesh>
              <sphereGeometry args={[baseSize * 3, 16, 16]} />
              <meshBasicMaterial color="#fde047" />
            </mesh>
            <Html style={{ pointerEvents: "none" }}>
              <span className="text-xs text-yellow-300">Sol</span>
            </Html>
          </group>
        )}

        {bubble && bubble.members.length > 0 && (
          <BubbleOverlay
            bubble={bubble}
            origin={origin}
            selectedId={selectedId}
            onSelect={onSelect}
            onOpen={onOpen}
            onHover={setHover}
          />
        )}
      </Canvas>
    </div>
  );
}
