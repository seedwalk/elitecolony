"use client";

import { useRouter } from "next/navigation";

/** Goes back in history (e.g. to the bubble or list you came from); falls back to the planner. */
export function BackButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
      className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs text-muted-foreground hover:border-foreground/60 hover:text-foreground"
    >
      ← Back
    </button>
  );
}
