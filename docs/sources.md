# Data sources

Researched 2026-11-01. Every claim below is backed by a real response in `docs/samples/` unless marked *(unverified)*.

## Summary

| Source | Use in ED BubblePlanner | Browser CORS | Notes |
|---|---|---|---|
| **Spansh API** | **Primary**: region discovery, bodies, rings/hotspots, stations/markets, colonisation status | ❌ No `Access-Control-Allow-Origin` → needs a stateless Next.js proxy route | Max 500 results/page, max 10,000 results per query |
| **EDSM API** | Secondary / fallback (systems, bodies, factions) | ✅ `Access-Control-Allow-Origin: *` | Less complete for recent colonisation data |
| **ED Colonise** | Not usable programmatically | — | Site redirects to `/Captcha`; import via pasted list only |
| **Spansh dumps** | Not used | — | 118 GB full / 4.6 GB populated — impossible in a browser |
| **EDDN** | Not in v1 | — | ZeroMQ stream, needs a long-running listener |
| **INARA** | Not used | — | *(unverified)* API is commander-oriented and needs an app key; no galaxy search |

## Spansh (https://spansh.co.uk)

All endpoints JSON, no auth. Search endpoints are `POST` with body
`{ filters, sort, size, page, reference_system | reference_coords }`.

### `POST /api/systems/search` — sample: `spansh-systems-search.json`
- Per system: `id64, name, x, y, z, distance, population, primary_economy, secondary_economy, government, allegiance, security, region, needs_permit, known_permit, body_count, updated_at`.
- **`nearest_populated_distance` / `nearest_populated_id64`** → direct input for the *independence* criterion.
- **`is_colonised`** and **`is_being_colonised`** work as filters (sample: `spansh-systems-search-colonised.json`). Colonised systems include `controlling_minor_faction`, `minor_faction_presences`, `stations`.
- `bodies[]` is only a summary (name, type, subtype, terraforming_state, distance_to_arrival) — **no landable flag, rings or signals**.
- Unknown filter names are silently ignored (returns the unfiltered count) — filters must be validated against known names.

### `POST /api/bodies/search` — sample: `spansh-bodies-search.json`
- **The bulk workhorse.** Full attributes per body: `subtype, is_landable, gravity, atmosphere, atmosphere_composition, volcanism_type, terraforming_state, surface_temperature, radius, earth_masses, distance_to_arrival, parents, is_rotational_period_tidally_locked, reserve_level` (stars), `materials, signals` (Biological/Geological counts), `genuses, landmarks`.
- **`rings[].signals`** = ring hotspots (e.g. `Platinum: 3, Painite: 2`), with `signals_updated_at`.
- Includes `system_id64, system_name, system_x/y/z` → bodies can be grouped into systems without extra calls.
- ~2 KB per body. A 15 ly sphere ≈ 356 bodies / 0.7 MB.

### `POST /api/stations/search` — sample: `spansh-stations-search.json`
- `type, has_large_pad, large/medium/small_pads, distance_to_arrival, is_planetary, market` (commodities with buy/sell/stock), `market_updated_at, economies, services`, **`system_is_colonised`**, `system_population`, `controlling_minor_faction`.
- Used for logistics: nearest L-pad markets selling construction materials.

### `GET /api/system/{id64}` and `GET /api/dump/{id64}`
- `/api/system` = same summary as systems search.
- `/api/dump` = full Journal-style system (~70 KB): bodies with rings+signals, stations. Useful for a single system refresh, too heavy for bulk.

### Limits
- `size` max **500** (larger silently falls back to 25).
- **Only the first 10,000 results** of a query can be paged → split large regions into distance shells.
- A 50 ly sphere around a frontier system ≈ 1,293 systems. Latency 1.5–2.5 s per page.
- No published rate limit found *(unverified)* → we self-limit (concurrency 2, backoff on 429/5xx) and cache aggressively.

### Freshness
- Fed by EDDN; `updated_at` per system/body/market. Sampled frontier data was 2026-07 → 2026-10.
- Data exists only for systems someone has scanned. Unscanned bodies/signals are missing, not absent → certainty `estimated`/`verify in game`.

### Does NOT provide
- Colonisation **claim** status for systems claimed but not yet built (only `is_being_colonised`, reliability *(unverified)*).
- Construction slot counts (orbital/surface) — not in any public API.
- "Walkable" as a field (derived: `is_landable` + atmosphere; Odyssey allows walking on all landables *(verify in game)*).

## EDSM (https://www.edsm.net)

- `GET /api-v1/sphere-systems?systemName&radius&showCoordinates&showInformation&showPrimaryStar` — sample `edsm-sphere-systems.json`. Radius max 100 ly *(per EDSM docs, unverified)*.
- `GET /api-system-v1/bodies?systemName` — sample `edsm-bodies.json`.
- `stations`, `factions` endpoints exist.
- **CORS enabled** → could be called directly from the browser.
- Coverage of Odyssey-era signals/hotspots and recent colonies is weaker than Spansh. Used only as fallback.

## ED Colonise (https://edcolonise.net)

- Every request redirects to `/Captcha?ReturnUrl=…` (ASP.NET/IIS). No public API.
- We **do not** scrape or bypass the captcha. Its data is itself Spansh/EDDN-derived (it links to Spansh).
- Import path: paste a list of system names (copied from ED Colonise results) → resolved via Spansh.

## EDDN

- Live ZeroMQ relay of player journal events. Needs a persistent server process to listen; doesn't fit a frontend-only Vercel app. Spansh already aggregates it. **Out of v1.**
