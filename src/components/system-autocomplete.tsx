"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { suggestSystems, type SystemRef } from "@/lib/spansh/client";

/**
 * System picker backed by Spansh quick search. Only a system chosen from the list is
 * accepted — free text never reaches the planner.
 */
export function SystemAutocomplete({
  value,
  onChange,
  placeholder = "Type a system name…",
}: {
  value: SystemRef | null;
  onChange: (s: SystemRef | null) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(value?.name ?? "");
  const [items, setItems] = useState<SystemRef[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value && text === value.name) return;
    const q = text.trim();
    if (q.length < 2) return;
    const ac = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await suggestSystems(q, ac.signal);
        const lq = q.toLowerCase();
        // Prefix matches first, then the rest as Spansh ranked them.
        res.sort((a, b) => Number(!a.name.toLowerCase().startsWith(lq)) - Number(!b.name.toLowerCase().startsWith(lq)));
        setItems(res.slice(0, 12));
        setActive(0);
        setOpen(true);
      } catch {
        /* aborted or network error: keep previous list */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [text, value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (s: SystemRef) => {
    onChange(s);
    setText(s.name);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <Input
        className={`h-8 ${value ? "border-emerald-600/60" : ""}`}
        placeholder={placeholder}
        value={text}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onChange={(e) => {
          setText(e.target.value);
          if (value) onChange(null);
          if (e.target.value.trim().length < 2) {
            setItems([]);
            setOpen(false);
          }
        }}
        onFocus={() => items.length && !value && setOpen(true)}
        onKeyDown={(e) => {
          if (!open || items.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(items.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(items[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {loading && <span className="absolute top-2 right-2 text-[10px] text-muted-foreground">…</span>}
      {open && (
        <ul role="listbox" className="absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover py-1 text-xs shadow-lg">
          {items.map((s, i) => (
            <li
              key={s.id64}
              role="option"
              aria-selected={i === active}
              className={`flex cursor-pointer justify-between gap-2 px-2 py-1 ${i === active ? "bg-muted" : ""}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
            >
              <span>{s.name}</span>
              <span className="text-muted-foreground">{Math.round(Math.hypot(s.x, s.y, s.z))} ly from Sol</span>
            </li>
          ))}
          {items.length === 0 && <li className="px-2 py-1 text-muted-foreground">No systems found</li>}
        </ul>
      )}
      {!value && text.trim().length >= 2 && !open && !loading && (
        <p className="mt-1 text-[11px] text-amber-400">Pick a system from the list</p>
      )}
    </div>
  );
}
