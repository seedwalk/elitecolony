# Colonisation rules

Collected 2026-11-01. Main source: *Elite Dangerous Colonization Mega Guide* v1.3.2 Beta (CMDR Mechan, June 2025, covers Trailblazers Update 3.3) — https://thefloweringash.com/elite/colonisation/ — which summarises Frontier's own forum post (https://forums.frontier.co.uk/threads/elite-dangerous-trailblazers-update-3-now-live.636973/).

Later updates (Type-11 Prospector 4.2.1, Dodec 4.2.2 — "end of Colonisation Beta") changed some numbers; the official notes returned 403 to automated fetches. **All rules below are tagged `verify in game` until confirmed.**

## Claiming

| Rule | Value | Source |
|---|---|---|
| Claim range | **15.00 ly** from the colonisation contact's system | Guide; community wiki agrees. Older beta: 10 → 16 ly |
| Where contacts exist | Bubble systems, and **player-architected systems once their primary port is complete** | Guide |
| Chaining ("bridging") | Yes — each completed colony becomes a new 15 ly origin | Guide |
| Not possible from | Colonia / other non-bubble populated systems not player-colonised | Guide |
| Claim fee | 25 M cr (not refunded) | Guide |
| Beacon deadline | 24 h after claim | Guide |
| Primary port deadline | 4 weeks | Guide |
| Claims | First-come, first-served, any game mode ("sniping" possible) | Guide |
| Factions | Inherited from the station/system you claim from | Guide |
| Demolition | Facilities can be demolished/cancelled; slots and CP refunded at weekly maintenance | Type-11 update notes (snippet) |

**Implication for the bubble planner:** a bubble is a **chain**: capital claimed ≤15 ly from an existing colonised system, then each member ≤15 ly from an already completed member (or any other colonised system).

## How bodies drive economies (colony-type ports)

Base inheritable economy of the **local body** a colony port is on/orbits:

| Local body | Economies |
|---|---|
| Black hole, neutron star, white dwarf | HighTech, Tourism |
| Brown dwarf & other stars | Military |
| Earth-like world | Agriculture, HighTech, Military, Tourism |
| Water world | Agriculture, Tourism |
| Ammonia world | HighTech, Tourism |
| Gas giant | HighTech, Industrial |
| High metal content / metal rich | Extraction |
| Rocky ice | Industrial, Refinery |
| Rocky | Refinery |
| Icy | Industrial |

Modifiers: **rings/belts → +Extraction**, **organics → +Agriculture, +Terraforming**, **geologicals → +Extraction, +Industrial**.

Strong-link boosts (≈ +0.4):
- **Tourism**: orbiting ELW/WW/ammonia, organics, geologicals, **system with black hole / white dwarf / neutron star**.
- **Extraction / Industrial / Refinery**: system reserve **Major or Pristine** (decreased by Low/Depleted); Extraction also by volcanism.
- **Agriculture**: orbiting ELW/WW, terraformable, organics (decreased by icy, tidally locked).
- **HighTech**: orbiting ammonia/ELW/WW, geologicals, organics.

Weak links (0.05) spread every facility's economy to every port in the system → **specialise systems, not bodies**.

## Logistics notes

- Refinery output (steel, titanium, aluminium) dominates construction demand → a refinery system early in a bubble is valuable.
- Large haulers (Type-9) can't dock at outposts (M pads) → L-pad markets matter without a Fleet Carrier.

## Not covered by any API

- Construction slot counts per system, CP (construction point) costs, current material lists per port type → manual / `verify in game`.
