"use client";

import { useSyncExternalStore } from "react";
import { ROLE_COLOR, type Certainty, type Role } from "@/lib/types";

const noopSubscribe = () => () => {};

/** false during SSR / first hydration pass, true on the client — avoids persisted-state hydration mismatches. */
export function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export function RoleChip({ role }: { role: Role }) {
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-black"
      style={{ background: ROLE_COLOR[role] }}
    >
      {role}
    </span>
  );
}

export function ScoreBar({ value, color = "#f97316" }: { value: number; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-1.5 w-14 overflow-hidden rounded-full bg-muted">
        <span className="block h-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
      </span>
      <span className="tabular-nums">{Math.round(value)}</span>
    </span>
  );
}

const CERT: Record<Certainty, { label: string; cls: string }> = {
  confirmed: { label: "confirmed", cls: "bg-emerald-500/15 text-emerald-400" },
  estimated: { label: "estimated", cls: "bg-sky-500/15 text-sky-400" },
  "verify-in-game": { label: "verify in game", cls: "bg-amber-500/15 text-amber-400" },
};

export function CertaintyTag({ c }: { c: Certainty }) {
  return <span className={`rounded px-1 py-0.5 text-[10px] ${CERT[c].cls}`}>{CERT[c].label}</span>;
}

export function StatusTag({ status }: { status: string }) {
  const cls =
    status === "Available"
      ? "text-emerald-400"
      : status === "Being colonised"
        ? "text-amber-400"
        : "text-muted-foreground";
  return <span className={cls}>{status}</span>;
}
