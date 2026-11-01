# ED BubblePlanner — data model & bubble algorithm (proposal for checkpoint)

## Data flow

```
User picks region (reference system/coords + radius, or distance-from-Sol band)
  │
  ├─ 1. Spansh systems/search  (pages of 500, split into distance shells ≤10k results)
  │      → candidate systems + colonised/populated systems (origins & neighbours)
  ├─ 2. Spansh bodies/search   (same region, shells) → all bodies + rings + hotspots
  └─ 3. Spansh stations/search (region + haul radius, has_large_pad, market)
         → logistics sources
           │
           ▼
      Dexie (IndexedDB)  ── normalized cache, fetchedAt + TTL per region query
           │
           ▼
      Web Worker: role scores → neighbour graph → bubble search → ranking
           │
           ▼
      UI (Zustand: weights, toggles, ranges, notes, roles, verified flags)
```

All Spansh calls go through one stateless Next.js route `/api/spansh/[...path]` (Spansh has no CORS). It only forwards; no storage.

## Dexie tables (trimmed fields only, ≈400 B/body)

- `systems` — id64, name, x/y/z, population, isColonised, isBeingColonised, needsPermit, nearestPopulatedDistance, controllingFaction, primaryEconomy, reserveLevel, mainStarType, updatedAt, source, fetchedAt
- `bodies` — id64, systemId64, name, type, subtype, isLandable, gravity, atmosphere, volcanism, terraformingState, distanceToArrival, parents, tidallyLocked, bioSignals, geoSignals, rings[{name, type, hotspots{}}], updatedAt
- `stations` — id, systemId64, name, type, largePads, mediumPads, isPlanetary, distanceToArrival, marketUpdatedAt, constructionCommodities{name: stock}
- `regionQueries` — key (center+radius+filters), fetchedAt, counts, status → drives TTL/refresh
- Estimated volume: 50 ly sphere ≈ 1.3k systems / ~40k bodies ≈ 15–20 MB. Fine for IndexedDB.

Every derived value carries `certainty: 'confirmed' | 'estimated' | 'verify-in-game'` and a `reason` string.

## Roles

Roles map to the game's real economies (see `colonization-rules.md`) plus Logistics:

| Role | Driven by |
|---|---|
| Capital (Tourism) | ELW/WW/ammonia, black hole / neutron / white dwarf in system, organics/geologicals; landables for surface slots |
| Extraction (mining) | HMC/metal-rich bodies, rings + hotspots, Pristine/Major reserve, volcanism |
| Refinery | Rocky bodies without rings/organics/geologicals, reserve |
| Industrial | Icy / rocky-ice / gas giants, geologicals |
| Agriculture | ELW/WW/terraformables with organics, not tidally locked |
| HighTech | Ammonia/ELW/WW, compact objects, geologicals |
| Military | Main-sequence / brown dwarf stars without belts |
| Logistics | Not an economy: proximity to L-pad markets with construction materials, central position in bubble |

Each system gets `roleScore[role] ∈ 0..100` with breakdown. A system can hold several roles.

## Bubble search

1. **Graph**: nodes = claimable candidates (unpopulated, no permit, not colonised/being colonised). Edge if distance ≤ `maxHop` (default 15 ly, rule tagged verify-in-game).
2. **Capital eligibility**: within 15 ly of a system with a colonisation contact (populated bubble system or completed player colony). Otherwise flagged "needs bridge" with bridge length.
3. **Beam search per capital**: state = set of members; expand by adding a node adjacent (≤ maxHop) to any member and within `maxRadius` of the capital. Keep top-B states per size. Record **best bubble per size k ∈ [minSystems, maxSystems]** → size↔score curve.
4. **Role assignment** per bubble: each target role → member with highest roleScore for it (a member may take several roles); report uncovered roles.

## Ranking criteria (weights via 0–10 sliders, normalized to %)

| Criterion | Inputs |
|---|---|
| Expansion | role coverage, extra claimable neighbours beyond the bubble, compactness (max hop, radius) |
| Capital quality | capital's Tourism score + landables/slots proxy |
| Build & supply | distance to nearest L-pad market with construction commodities; changes with toggles (Fleet Carrier, min pad, max haul ly) |
| Independence | nearestPopulatedDistance, colonised/being-colonised systems within radius, foreign factions |
| Economic diversity | distinct economies across the bubble |

Score functions are pure TS (`src/lib/scoring`), unit-tested, run in the worker.

## Decisions

- **Spansh over EDSM** as primary: bodies search gives full attributes + ring hotspots in bulk; EDSM lacks hotspot coverage.
- **Proxy only for Spansh** because it lacks CORS; stays stateless → fits Vercel.
- **No dumps**: 4.6–118 GB.
- **No ED Colonise scraping**: captcha-protected; paste-a-list import instead.
- **Pagination**: shells by distance to stay under the 10k-result cap.
