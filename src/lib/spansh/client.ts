import type { Vec3 } from "../types";

/** Small promise queue with limited concurrency + retries with exponential backoff. */
class Queue {
  private running = 0;
  private waiting: (() => void)[] = [];
  constructor(private concurrency: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.concurrency) await new Promise<void>((r) => this.waiting.push(r));
    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      this.waiting.shift()?.();
    }
  }
}

const queue = new Queue(2);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class SpanshError extends Error {}

async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  return queue.run(async () => {
    let attempt = 0;
    for (;;) {
      signal?.throwIfAborted();
      const res = await fetch(`/api/spansh/${path}`, {
        method: body ? "POST" : "GET",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal,
      });
      if (res.ok) {
        const json = await res.json();
        if (json && typeof json === "object" && "error" in json && json.error) throw new SpanshError(String(json.error));
        return json as T;
      }
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= 4) {
        let msg = `${res.status}`;
        try {
          msg = (await res.json()).error ?? msg;
        } catch {}
        throw new SpanshError(`Spansh ${path}: ${msg}`);
      }
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
      attempt++;
    }
  });
}

export type Reference = { system: string } | { coords: Vec3 };

export interface SearchPage<T> {
  count: number;
  results: T[];
  reference?: { id64: number; name: string; x: number; y: number; z: number };
}

/** Stations carry full markets (~70 KB each), so they use smaller pages. */
export const PAGE_SIZE: Record<"systems" | "bodies" | "stations", number> = { systems: 500, bodies: 500, stations: 100 };
export const MAX_RESULTS = 10_000;

export function searchPage<T>(
  kind: "systems" | "bodies" | "stations",
  ref: Reference,
  distMin: number,
  distMax: number,
  page: number,
  extraFilters: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<SearchPage<T>> {
  const body: Record<string, unknown> = {
    filters: { distance: { min: String(distMin), max: String(distMax) }, ...extraFilters },
    sort: [{ distance: { direction: "asc" } }],
    size: PAGE_SIZE[kind],
    page,
  };
  if ("system" in ref) body.reference_system = ref.system;
  else body.reference_coords = ref.coords;
  return request<SearchPage<T>>(`${kind}/search`, body, signal);
}

/**
 * Fetches every result between two distances from `ref`, splitting into thinner shells so
 * that no single query hits Spansh's 10k pageable-result cap (Spansh reports count ≤ 10k,
 * so a count of exactly 10k means "maybe more" and triggers a split).
 */
export async function fetchShell<T>(
  kind: "systems" | "bodies" | "stations",
  ref: Reference,
  minDist: number,
  maxDist: number,
  onPage: (items: T[], progress: { fetched: number; total: number }) => void | Promise<void>,
  extraFilters: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<{ total: number; reference?: SearchPage<T>["reference"] }> {
  let fetched = 0;
  let total = 0;
  let reference: SearchPage<T>["reference"];

  async function shell(min: number, max: number): Promise<void> {
    const first = await searchPage<T>(kind, ref, min, max, 0, extraFilters, signal);
    reference ??= first.reference;
    if (first.count >= MAX_RESULTS && max - min > 0.25) {
      // Split by volume so both halves hold roughly the same number of results.
      const mid = Math.cbrt((min ** 3 + max ** 3) / 2);
      await shell(min, mid);
      await shell(mid, max);
      return;
    }
    total += first.count;
    fetched += first.results.length;
    await onPage(first.results, { fetched, total });
    const pages = Math.ceil(Math.min(first.count, MAX_RESULTS) / PAGE_SIZE[kind]);
    // Remaining pages go through the shared queue (concurrency-limited).
    await Promise.all(
      Array.from({ length: Math.max(0, pages - 1) }, async (_, i) => {
        const page = await searchPage<T>(kind, ref, min, max, i + 1, extraFilters, signal);
        fetched += page.results.length;
        await onPage(page.results, { fetched, total });
      }),
    );
  }

  await shell(minDist, maxDist);
  return { total, reference };
}

export function fetchSphere<T>(
  kind: "systems" | "bodies" | "stations",
  ref: Reference,
  radius: number,
  onPage: (items: T[], progress: { fetched: number; total: number }) => void | Promise<void>,
  extraFilters: Record<string, unknown> = {},
  signal?: AbortSignal,
) {
  return fetchShell(kind, ref, 0, radius, onPage, extraFilters, signal);
}

/** Autocomplete: system names starting with / matching `q` (Spansh quick search). */
export async function suggestSystems(q: string, signal?: AbortSignal): Promise<SystemRef[]> {
  if (q.trim().length < 2) return [];
  const res = await request<{ results: SystemRef[] }>(`search/systems?q=${encodeURIComponent(q.trim())}`, undefined, signal);
  return res.results ?? [];
}

export interface SystemRef {
  id64: number;
  name: string;
  x: number;
  y: number;
  z: number;
}

/** Resolves an exact system name (case-insensitive) to coordinates via Spansh quick search. */
export async function resolveSystem(name: string, signal?: AbortSignal): Promise<SystemRef | null> {
  const res = await request<{ results: SystemRef[] }>(`search/systems?q=${encodeURIComponent(name)}`, undefined, signal);
  const wanted = name.trim().toLowerCase();
  return res.results?.find((r) => r.name.toLowerCase() === wanted) ?? null;
}
