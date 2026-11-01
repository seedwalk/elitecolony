# Decisions

| # | Decision | Why |
|---|---|---|
| 1 | **No database; frontend-only** (Dexie/IndexedDB cache + Zustand persist) | Deploys on Vercel with no persistent disk; single-player tool; a 40 ly region is ~4 MB, a 100 ly frontier band ~20 MB — fine for IndexedDB. Revisit only if volume becomes a problem. |
| 2 | **Spansh as primary source** | Bodies search returns full attributes + ring hotspots in bulk; systems search returns `nearest_populated_distance`, colonisation flags and filters by `body_subtype`; stations search filters by market commodity. EDSM lacks hotspot coverage. |
| 3 | **Stateless proxy only for Spansh** | Spansh sends no CORS headers. The proxy forwards an allow-list of endpoints with an identifying User-Agent and stores nothing. |
| 4 | **No ED Colonise scraping** | Captcha-protected, no API. Paste-a-list import instead; its data is Spansh-derived anyway. |
| 5 | **No galaxy dumps** | 4.6–118 GB. |
| 6 | **Two-stage search: frontier scan → zone analysis** | A 250–350 ly band holds ~280k systems; downloading full bodies for all is infeasible. Stage 1 downloads only unpopulated systems with tourism-grade bodies (~3.5k, body summaries) and ranks zones; stage 2 fetches full data for chosen zones. |
| 7 | **Roles = the game's economies** (+ Logistics) | Role suggestions follow the economy-inheritance table instead of invented categories; Refinery is separate from Extraction because refinery output dominates construction demand. |
| 8 | **Beam search, best bubble per size** | Exhaustive combinations explode; beam search (width configurable) per capital gives one bubble per size, so the user sees the size↔score curve. Its objective is weight-independent, so moving weight sliders re-ranks instantly without recomputing. |
| 9 | **Construction market = station selling Steel** | Server-side Spansh market filter keeps station downloads small (each station carries ~70 KB of market data). |
| 10 | **Spansh count is capped at 10,000** | A count of exactly 10k triggers splitting the distance shell by volume. |
| 11 | **Zustand over Redux** | Same persistence with far less code; redux-persist is effectively unmaintained. |
| 12 | **TanStack Table v8** | Stable, well-known API (v9 was just released). |
| 13 | **3D map with react-three-fiber**, lazy-loaded | User preference; loaded via `next/dynamic` with `ssr: false` so it doesn't weigh on other pages. |
| 14 | **Everything in English** | User requirement (UI, code, docs). |
| 15 | **Max claim bridges filter (default 0)** + bridge penalty in Build & supply | A first colony must be claimable directly from the bubble; remote zones otherwise ranked high on independence while being unreachable. |
| 16 | **Claim reach uses Spansh `nearest_populated_distance`** as well as downloaded systems | Zones far from the bubble had no populated system in the downloaded sphere, producing absurd bridge counts. |
| 17 | **Nearest market only within the searched range** | With several analysed zones, a market in another zone was reported as "nearest" (hundreds of ly away). |
| 18 | **Point clouds as constant-pixel sprites** | Thousands of systems across 2,400 ly stay visible at any zoom without hiding bubble members. |
| 19 | **Risks are categorised** (`riskCodes`) and filterable; shown as chips on every card | Users need to see and filter risks at a glance, not read free text. |
| 20 | **Competition measured from every member, by distance** (nearest other colony, colonies within claim range, active claims within claim range) | A colony within 15 ly of any member can claim your neighbours; a colony 30 ly from the capital cannot. |
| 21 | **The claim contact is excluded from independence and competition**; no "crowded area" risk | A first colony *must* be within 15 ly of a populated system, so penalising that proximity punished every valid option. |
| 22 | **Filters panel edits a draft** (zustand store copy) and applies on "Apply & re-analyse" | Avoids re-running the analysis on every slider move; mirrors Airbnb's Filters UX. |
