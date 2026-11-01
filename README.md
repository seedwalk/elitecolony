# ED BubblePlanner

Plan a multi-system colony — a **mini bubble** — in Elite Dangerous.

ED BubblePlanner doesn't look for one perfect system. It looks for a **group of claimable systems within claim range of each other** that, together, cover the economies you want (tourism capital, extraction, refinery, industrial, agriculture, logistics…), and ranks those groups with weights you control.

Unofficial fan tool. Not affiliated with Frontier Developments. Data from [Spansh](https://spansh.co.uk) (fed by [EDDN](https://github.com/EDCD/EDDN)); colonisation rules from the community [Colonization Mega Guide](https://thefloweringash.com/elite/colonisation/). See `/about` in the app for full credits.

## Install & run

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # scoring, bubble search, frontier scan, Spansh parsers
npm run build      # production build (deploys as-is to Vercel)
```

Node 20+ (developed on Node 24). No database, no API keys, no environment variables.

## How to use

1. **Search area**
   - **Frontier (distance to Sol)** — pick a band (e.g. 250–350 ly) and whether you prefer the *outer* or *inner* edge, then **Scan frontier**. This downloads every *unpopulated* system in the band that has a tourism-grade body (ELW, WW, AW, black hole, neutron star, white dwarf) with a body summary (~3.5k systems / ~20 MB for 250–350 ly, ~20 s).
   - **Around a system** — pick a system from the autocomplete (only real systems are accepted) and a radius.
   - **Coordinates** — same, with x/y/z.
   - **Paste systems** — one per line (e.g. copied from ED Colonise); they are analysed as capital candidates.
2. **Frontier zones** tab — every claimable anchor system is scored as the centre of a potential bubble (estimated, from body summaries). **Analyse** one zone, or **Analyse ◆** the top N non-overlapping zones.
3. **Bubbles** tab — for each capital candidate, the best bubble **for every size** in your range (e.g. 1–8 systems) and the size↔score curve. The recommended size is the smallest one within 3 points of that capital's best.
4. Click a bubble → **bubble view**: 3D map (claim ranges, other colonies, L-pad markets), members side by side, suggested roles, your own role assignment, score breakdown with certainty tags, advantages, risks and missing data.
5. Click a system → **system detail**: every body with all attributes, rings and hotspots, role-fit breakdown, your notes / roles / "verified in game".

### Controls

| Control | Effect |
|---|---|
| Ranking weights (0–10 each) | Independent sliders, normalised to %; stacked bar shows the split. Saveable profiles. Re-ranks instantly. |
| Location (distance to Sol) | 6th criterion: where the capital sits inside the Sol band, according to *inner / neutral / outer* preference. |
| Roles the bubble must cover | Target roles. A system may cover several roles. |
| Number of systems (range) | Bubble sizes evaluated (1 = a single system that does everything). |
| Max hop / max radius / claim range | Bubble geometry. Claim range defaults to the game's 15 ly. |
| Hauling | Fleet Carrier (×5 haul range), minimum pad at markets (L/M), acceptable haul distance. |

## Architecture

- **Next.js 16 (App Router) + TypeScript strict + Tailwind 4 + shadcn/ui (Base UI) + TanStack Table**, deploys to Vercel.
- **Frontend-only data.** The browser downloads from Spansh through `src/app/api/spansh/[...path]/route.ts`, a stateless allow-listed proxy (Spansh sends no CORS headers). Nothing is stored server-side.
- **Cache:** IndexedDB via Dexie (`src/lib/db.ts`) — systems, bodies, stations, region queries and frontier scans, with a configurable TTL.
- **User state:** Zustand + persist (`src/store/settings.ts`) — weights, profiles, planner settings, notes, roles, verified flags. JSON export/import as backup.
- **Engine (pure, unit-tested, runs in a Web Worker):**
  - `src/lib/engine/roles.ts` — role scores per system from the economy-inheritance rules.
  - `src/lib/engine/bubbles.ts` — neighbour graph, beam search for the best bubble per size, 6 criteria with explained reasons.
  - `src/lib/engine/frontier.ts` — stage-1 zone scoring over a Sol band.
  - `src/lib/engine/scoring.ts` — weight normalisation and ranking (UI and every view use the same function).
- Research and decisions: `docs/sources.md`, `docs/colonization-rules.md`, `docs/design.md`, `docs/decisions.md`; real API samples in `docs/samples/`.

## Known limitations

- **Role scores are estimates** based on community research of economy inheritance; construction slot counts and CP costs are not available from any API. Every derived value carries a certainty tag (`confirmed` / `estimated` / `verify in game`).
- **Frontier zones are a pre-screen**: only systems with tourism-grade bodies are scanned and only body summaries are used. Analyse a zone to get rings, hotspots, landables, markets and nearby colonies.
- **Claim reach** uses the nearest populated system as a proxy for a colonisation contact; non-player systems outside the bubble (e.g. Colonia) don't have one.
- **Being-colonised status** comes from Spansh and can lag behind the game; claims are first-come-first-served — always check in game.
- Data exists only for systems someone has scanned (EDDN). Missing bodies/signals appear in *Missing data*, not as absences.
- Spansh has no published rate limit; the app limits itself to 2 concurrent requests with backoff and caches aggressively.
- In development, the 3D map logs a harmless React 19 / drei `<Html>` unmount warning when leaving the bubble page.
