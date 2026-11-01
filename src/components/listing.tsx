"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CRITERIA, CRITERION_LABEL, type Criterion } from "@/lib/engine/bubbles";
import { CRITERION_COLOR } from "./weights-panel";

/* ------------------------------------------------------------------ */
/* Airbnb-style filter bar                                             */
/* ------------------------------------------------------------------ */

/** A rounded pill that opens a small popover with its control. */
export function FilterPill({
  label,
  value,
  active = false,
  align = "left",
  wide = false,
  children,
}: {
  label: string;
  value?: ReactNode;
  active?: boolean;
  /** Which edge of the pill the popover aligns to. */
  align?: "left" | "right";
  /** Wider popover for full settings panels. */
  wide?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-xs whitespace-nowrap transition-colors ${
          active ? "border-foreground bg-foreground/10" : "hover:border-foreground/60"
        }`}
      >
        <span className="font-medium">{label}</span>
        {value !== undefined && <span className="text-muted-foreground">{value}</span>}
        <span className="text-[9px] text-muted-foreground">▾</span>
      </button>
      {open && (
        <div
          className={`absolute top-10 z-50 max-h-[calc(100vh-140px)] overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-xs text-zinc-100 shadow-2xl shadow-black/60 ${
            align === "right" ? "right-0" : "left-0"
          } ${wide ? "w-80" : "w-72"}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 flex-wrap items-center gap-2 border-b pb-2">{children}</div>;
}

/* ------------------------------------------------------------------ */
/* Card list with progressive loading + scroll-to-selected             */
/* ------------------------------------------------------------------ */

export function CardList<T>({
  items,
  getId,
  selectedId,
  renderCard,
  empty,
  pageSize = 40,
}: {
  items: T[];
  getId: (item: T) => number;
  selectedId: number | null;
  renderCard: (item: T) => ReactNode;
  empty?: ReactNode;
  pageSize?: number;
}) {
  const [limit, setLimit] = useState(pageSize);
  const boxRef = useRef<HTMLDivElement>(null);
  const index = selectedId === null ? -1 : items.findIndex((i) => getId(i) === selectedId);
  const shown = Math.max(limit, index + 1);

  useEffect(() => {
    if (selectedId === null) return;
    requestAnimationFrame(() =>
      boxRef.current?.querySelector(`[data-card-id="${selectedId}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    );
  }, [selectedId]);

  if (items.length === 0) return <div className="py-16 text-center text-sm text-muted-foreground">{empty ?? "Nothing matches"}</div>;

  return (
    <div ref={boxRef} className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">{items.slice(0, shown).map((it) => renderCard(it))}</div>
      {shown < items.length && (
        <div className="flex justify-center">
          <button
            className="rounded-full border px-4 py-1.5 text-xs hover:border-foreground/60"
            onClick={() => setLimit(shown + pageSize)}
          >
            Show more ({items.length - shown} left)
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card building blocks                                                */
/* ------------------------------------------------------------------ */

export function ScoreBadge({ score }: { score: number }) {
  const hue = Math.round(Math.max(0, Math.min(100, score)) * 1.2);
  return (
    <span
      className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-1.5 text-sm font-semibold tabular-nums text-black"
      style={{ background: `hsl(${hue}, 75%, 55%)` }}
      title="Score for your current weights"
    >
      {Math.round(score)}
    </span>
  );
}

/** Six tiny bars, one per criterion. */
export function CriteriaBars({ scores }: { scores: Record<Criterion, number> }) {
  return (
    <div className="grid grid-cols-6 gap-1">
      {CRITERIA.map((c) => (
        <div key={c} title={`${CRITERION_LABEL[c]}: ${Math.round(scores[c])}`}>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full" style={{ width: `${scores[c]}%`, background: CRITERION_COLOR[c] }} />
          </div>
          <div className="mt-0.5 truncate text-[9px] text-muted-foreground">{CRITERION_LABEL[c].split(" ")[0]}</div>
        </div>
      ))}
    </div>
  );
}

export function ListingCard({
  cardId,
  selected,
  onSelect,
  onOpen,
  onHover,
  children,
}: {
  cardId: number;
  selected: boolean;
  onSelect: () => void;
  onOpen?: () => void;
  onHover?: (on: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div
      data-card-id={cardId}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen?.();
        if (e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`flex cursor-pointer flex-col gap-2.5 rounded-2xl border bg-card p-3.5 text-xs transition-all hover:shadow-lg ${
        selected ? "border-orange-500 ring-2 ring-orange-500/40" : "hover:border-foreground/30"
      }`}
    >
      {children}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="truncate font-medium">{value}</div>
    </div>
  );
}

/** Split layout: scrollable cards on the left, sticky map on the right. */
export function SplitListing({ list, map }: { list: ReactNode; map: ReactNode }) {
  return (
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[420px_minmax(0,1fr)] 2xl:grid-cols-[460px_minmax(0,1fr)]">
      <div className="min-h-0 min-w-0 overflow-y-auto lg:pr-1">{list}</div>
      <div className="min-h-[320px] min-w-0">{map}</div>
    </div>
  );
}
