import { CRITERIA, type Bubble, type CapitalResult, type Criterion } from "./bubbles";

export type Weights = Record<Criterion, number>; // each 0..10

export interface WeightProfile {
  name: string;
  weights: Weights;
  builtin?: boolean;
}

export const BUILTIN_PROFILES: WeightProfile[] = [
  { name: "Balanced", builtin: true, weights: { expansion: 6, capital: 5, build: 4, independence: 3, diversity: 2, location: 2 } },
  { name: "Capital first", builtin: true, weights: { expansion: 4, capital: 10, build: 3, independence: 2, diversity: 2, location: 1 } },
  { name: "Logistics first", builtin: true, weights: { expansion: 5, capital: 3, build: 10, independence: 1, diversity: 3, location: 0 } },
  { name: "Isolated & large", builtin: true, weights: { expansion: 8, capital: 4, build: 2, independence: 10, diversity: 4, location: 6 } },
];

/** Independent 0–10 sliders → percentages summing to 100 (all-zero → equal split). */
export function normalizeWeights(w: Weights): Record<Criterion, number> {
  const val = (c: Criterion) => Math.max(0, w[c] ?? 0);
  const total = CRITERIA.reduce((s, c) => s + val(c), 0);
  const out = {} as Record<Criterion, number>;
  for (const c of CRITERIA) out[c] = total === 0 ? 100 / CRITERIA.length : (val(c) / total) * 100;
  return out;
}

export function weightedScore(b: { criteria: Record<Criterion, { score: number }> }, w: Weights): number {
  const pct = normalizeWeights(w);
  let s = 0;
  for (const c of CRITERIA) s += (b.criteria[c].score * pct[c]) / 100;
  return Math.round(s * 10) / 10;
}

export interface RankedCapital {
  capitalId64: number;
  /** Bubble recommended for this capital: smallest size within `tolerance` points of its best score. */
  recommended: Bubble;
  recommendedScore: number;
  curve: { size: number; score: number; bubble: Bubble }[];
}

export function rankCapitals(results: CapitalResult[], w: Weights, tolerance = 3): RankedCapital[] {
  const ranked = results.map((r) => {
    const curve = r.bubbles.map((b) => ({ size: b.size, score: weightedScore(b, w), bubble: b }));
    const best = Math.max(...curve.map((c) => c.score));
    const rec = curve.find((c) => c.score >= best - tolerance) ?? curve[curve.length - 1];
    return { capitalId64: r.capitalId64, recommended: rec.bubble, recommendedScore: rec.score, curve };
  });
  ranked.sort((a, b) => b.recommendedScore - a.recommendedScore || a.recommended.size - b.recommended.size);
  return ranked;
}
