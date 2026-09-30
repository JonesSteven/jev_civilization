# Jev Civilizations — Handoff Note

Date: 29 September 2026 · current: rules-3.0.0 · content-3.0.0 · model `jev-1.13.0`

The sections after the two updates below describe the original rules-1.0.0 delivery. The product requirements document (PRD) that the requirement IDs refer to is private and not part of this repository.

## Update: `dramatic` branch (rules-3.0.0, content-3.0.0)

Playtest feedback: outcomes were mundane (tribes almost never died, none took over), and the dynamics were hard to
follow. Goal: small strokes of luck compound into very different fates, in the spirit of *Guns, Germs, and Steel*.
Every number is in `content/balance.ts`, and the tuning steps are logged in `BALANCE_CHANGELOG`.

| Area | What changed |
| --- | --- |
| Scale | Populations ×10 (`SCALE`): tribes start at 1,000 people. Food, materials, costs, housing, and tile stocks scale with them. |
| Luck by place | 18 of the 33 event families now strike one **settled region** (a radius-22/28 area centred on a random claimed tile), announced and highlighted before the choice. |
| Magnitudes | Modifier limits 0.1–3.0 (were 0.25–2.0), destruction cap 60% (was 20%), durations up to 6 turns. Harsh options are 3–5× harsher (e.g. Bitter winter exposure +0.25, Violent storms −45 shelter, Locusts farms ×0.2); good ones are stronger (×1.5–1.8). |
| Germs | New E33 Sickness: an `epidemic` op kills up to 5/20/40% in the region and spreads at half strength to neighbours whose land touches. `diseaseResistance`: Hearthwood 0.35, Stonehaven 0.8, others 1.0. |
| Growth and collapse | Hunger kills up to 40% a turn (was 10%). Births follow food (5%, or 10% with 3 turns of stores) up to 1.5× shelter, and the unsheltered die in winter. Morale drifts back toward 60. A tribe **below 60 people breaks apart**. |
| Compounding | Technologies are much stronger (Agriculture farms ×1.6, Fishing ×1.5, Tools ×1.6, Irrigation drought floor 90%). Research effort grows with population (+1 per 3,000 people, max 4). Up to 5 settlements. |
| Raids | On success the defender loses 6% and the attacker 3%; on failure the attacker loses 10%. Forts give +35% per level. A tribe raided in the last two turns defends at ×1.6. **Conquest**: a successful raid by a tribe ≥5× larger ends a remnant under 300; half its survivors, plus its land, stores, and technologies, pass to the raider. |
| Unions | New actions `offer_union` and `accept_union` (23 kinds). The offer requires ≥4× the target's size; a target of ≥300 people that is declining (or is ≤1/8 our size); and food for the joiners. It stays open for 2 turns. The smaller tribe's Jev decides whether to accept; if it does, 90% of its people, land, settlements, buildings, stores, and technologies join. `GameState.unionOffers` holds open offers. |
| Ending | `isMatchOver`: the match finishes when one tribe (or none) is left. Results then say who "took over the land". Default length stays at 50 turns. |
| Score | Population weighs more: population 55 (target 10,000), resilience 15, development 15, influence 15 (target 600 tiles). |
| Fates | `TribeState.fate` is `collapsed`, `conquered`, or `joined`, and `absorbedBy` names the other tribe. Both are optional, so older states still load. |

**Messaging and simplification (player-facing only; Jev still sees every action):**
- `lib/game/summary.ts` builds a plain-language headline and per-tribe lines from measured population changes and their causes. It is stored on `TurnRecord.summary`, passed through replay, and shown in the log, a "Last turn" card, and replays.
- The event card shows the struck region and which settlements lie inside it. Each option shows "Likely helps / Likely hurts" (`lib/game/impact.ts`); exact effects sit behind a Details toggle.
- The scoreboard shows ▲/▼ change since the last turn and each tribe's fate. The tribe panel opens with an "At a glance" block.
- Actions are grouped into 8 plain labels (`ACTION_GROUPS`). Help and onboarding were rewritten more briefly.

**Compatibility:** games saved under older rules refuse new turns with `rules_outdated`; their replays still work.

### Verification for this update
- `npm test`: 82 tests pass. New `tests/engine/dramatic.test.ts` covers collapse, union eligibility, offer → accept → merge, offer expiry, conquest, epidemic resistance and the plague forecast, overcrowding, research scaling, ending early, and summary wording. Catalog tests now check regional versus world scope and the sickness family.
- `npm run test:e2e`: 6 pass. Lint, typecheck, build, catalog validation, and the secret scan are clean.
- Mock simulation (`reports/simulation-100x100-dramatic-mock.txt`, 100 × 100 turns, 0 crashes):
  - At turn 100, the largest tribe is ≥4× the smallest (or a tribe is gone) in 67% of games.
  - 45% of games lose a tribe (median turn 64; 2% before turn 15). Unions happen in 35% of games and conquests in 10%.
  - Wins: Hearthwood 37, Ironfang 29, Stonehaven 25, Windstep 9.
  - The 200-turn run is in `reports/simulation-30x200-dramatic-mock.txt`.
  - The mock policy raids much more than Jev, so Ironfang is stronger in mock than in live play.
- Live Jev (`reports/live-eval-100-dramatic.txt`, 5 × 100 turns, with turn-by-turn logs):
  - The 4× spread is reached in 4 of 5 matches, and two matches ended in a conquest.
  - Four different tribes won, Windstep included.
  - Across the 12 earlier live tuning matches: 4× spread in 9, and a union or conquest in 6.
  - Cost is about 13k tokens per turn.
- Tuning tools: `npm run simulate` now prints drama metrics (`--story` shows the summaries turn by turn). The new `npm run live-sim` plays full games against real Jev.

### Second round (same branch)
- **Prompt:** each tribe view now carries `advisories` (`growthAdvisories` in `lib/game/views.ts`). These are engine-computed notes on unsheltered people and the next winter, the birth limit at 1.5× shelter, depleted wild food, ready scouted sites, and the timber a house needs.
  - The instructions explain that food alone does not make a community grow.
  - The housing, timber, scouting, and founding candidates state their concrete benefit.
  - Routine timber and stone income rose to 80 and 50 per turn, because housing was affordable only about one turn in seven.
  - Same-seed live comparison (5 × 100 turns): founding 13 → 68, scouting 8 → 43, housing 117 → 154, gathering unchanged (about 70%).
- **Every option matters:**
  - Options that only moved timber, stone, travel, or terrain now also change food, people, or shelter.
  - Natural shelter was scaled up to matter at the new population scale.
  - The forecast (`lib/game/impact.ts`, shared `impactContext`) scores those effects too.
  - Regional events centre on a random settlement.
  - A catalog rule (`isMaterialEffect`) and a test enforce it: no event card has three "little effect" options, and at most 6% of options do (measured 4.2%).
- **Nature's turn:**
  - Nature's pick goes to Jev at once. The result is held in a review panel (`components/NatureReview.tsx`) with Nature's pick, both turns' summaries, and each tribe's action, until the player presses **Proceed to my turn**.
  - The Pause Nature control is gone.
- **Status:** `components/DecidingStatus.tsx` shows a progress bar, a staged checklist, and elapsed time while a turn is decided. The stages describe a turn, not live server telemetry.
- **Default length:** back to 50 turns.
- (Superseded in the third round: the supported bar moved beside the map, and results moved from the review panel into the log.)
- **Mock drama** fell to 47% of 100-turn games at 4× (mock tribes build much more housing and grow evenly). The live check still had 4 of 5.

### Third round (same branch)
- **Layout:** the supported-tribe summary is a card (`components/SupportedCard.tsx`) under the Tribes table, beside the map.
- **Event log:**
  - Each turn now lists what every tribe did (`groupActivity` in `lib/client/labels.ts`): its action in plain words and that action's results, including raids from both sides (outcomes now carry `target`).
  - The review panel no longer repeats results. It points to the log.
  - Replays show the same activity list.
- **Choice modes:** `GameState.settings` holds `choiceMode` (player / alternate / computer), `stance` (help / hurt / random), and `supportedTribe`. The start screen offers both choices.
  - `choiceSourceFor` decides who chooses each turn.
  - Help/hurt picks the option with the best (or worst) forecast for the supported tribe relative to its rivals' average (`relativeScore` / `steeredPick` in `lib/game/impact.ts`). Ties are broken by seeded order, so picks replay exactly.
  - Settings never reach Jev (tested).
  - Computer-only games auto-play (about 3 s per turn, 1 s on fast) with Pause/Resume.
- **Much faster, more extreme** (logged in `BALANCE_CHANGELOG`):
  - **Stronger traits:** farm ×1.4, fish ×1.8, hunt/gather ×1.8, raid ×2. Disease resistance: Hearthwood 0.25, Windstep and Ironfang 1.3.
  - **Momentum births:** 5%, or 15% for a thriving tribe. Thriving means stores for 2 turns, this turn's own harvest covering what it eats, no shrinking for 3 turns, and at least 60% of its own peak population.
  - **Losing heart:** a tribe that loses 20% or more in one turn loses 25 morale, so births stall.
  - **Harsher shocks:** hunger 50%, winter exposure 8%.
  - **Milder seasons:** winter farms 50%.
  - **Scale:** gathering, foraging, and new housing scale with population, which removes the flat-payoff rubber band. Births are allowed up to 2× shelter.
  - **Collapse and conquest:** tribes collapse below 200 people. Conquest takes a raided remnant under 500 by a tribe 4× larger.
  - **Automatic union offers:** from turn 10, a tribe 3× larger than a neighbour that has shrunk to 80% of its size 5 turns earlier (or 8× larger than a steady one) offers. The smaller tribe's Jev decides whether to accept. The offer action was removed from candidates.
  - **Ironfang** now hunts (innate hunting, 4 starting hunting sites) and forages from turn 1. Without that it always starved and was absorbed first.
- **Results:**
  - Mock (100 × 50, `reports/simulation-100x50-dramatic-mock.txt`): a tribe lost in 70% of games; 8× spread or a tribe gone in 70%; departures spread across all four tribes; 10% of losses come before turn 15.
  - Live (5 × 50, same seeds): a tribe was gone by turn 50 in 4 of 5 matches, each time a different tribe; before this round the same seeds had no departures.

### Known behaviour
- Jev chooses Gather food most turns and rarely Defends or Trains, so a tribe next to Ironfang can be raided many turns in a row.
- A last-tribe-standing finish is rare within 100 turns (3% of 200-turn mock games).

## Update: `dynamic` branch (rules-2.0.0, content-2.0.0)

This update responds to playtest feedback. It **deliberately departs from the PRD** in the ways listed below;
everything else in the PRD still holds. All numbers are in `content/balance.ts` and are logged in `BALANCE_CHANGELOG`.

| Feedback | What changed | PRD deviation |
| --- | --- | --- |
| Starts too close or overlapping | Settlements are ≥ 26 travel units apart (was 10), each tribe has a neighbour within 48, and every start-territory tile is ≥ 6 tiles from any other tribe's territory. Territories never share tiles, and a tile claimed by two tribes at once goes to nobody. | §6.2 spacing values |
| 100 turns is long | Match length is chosen per game: 10–200 turns, default 50 (start screen; `totalTurns` on `POST /api/games`). The per-game Jev attempt budget is 3 × length (capped by `JEV_MAX_ATTEMPTS_PER_GAME`). DB migration 2 adds `total_turns`. | R08/AC03 fixed 100 turns |
| Too static | Start population 100, shelter 120, food 400 (Ironfang 700), 4 starting sites. Births 4% per turn, 7% while stores cover ≥ 4 turns. Housing holds 40 (camps 30). Working range 8 + population/60 (max 16, Logistics +4). **Organic border growth**: each turn a tribe claims ~1 unclaimed border tile per 40 people (max 6). **Raids capture** up to 4 defender border tiles. Explicit Expand claims 16 tiles. Score targets: population 600, influence 400. | §7 starting values, §8.3 birth rate, §13 targets |
| Stuck in a poor spot | **Send scouts** (15 food) surveys unclaimed land up to 40 travel units away and reports the two best sites ≥ 26 units from every settlement. **Found settlement** (80 food, 10 timber, ≥ 80 people) creates an outpost that claims 20 tiles and adds a camp for 30 people. Up to 3 settlements per tribe. People, stores, and technologies stay tribe-wide. Relocation and defenses apply to the capital; raids target a named settlement. | §6.3 single main settlement |
| Local events felt irrelevant | All 32 events and 96 options apply to the whole map (terrain/near-water filters still differentiate tribes). Descriptions were rewritten; the catalog validator enforces world scope. The area highlight was removed. | R09 / §10.1 seeded footprints |

Other rule changes made during tuning:
- **Reach**: raid (36), recruit (24), and scout (40) reach is measured over base terrain, then scaled by travel conditions at the capital (−25% per +1 penalty, bounded 50–125%). Weather still fully affects relocation. Before this change, world-wide travel penalties left Ironfang with raid options on only 5 of 48 live turns.
- **Raids** cost up to 15 food, or whatever remains, so an empty larder never locks raiders out. The Ironfang raid multiplier is ×1.5 and the food loot cap is 300.
- **Trait tuning**: Hearthwood farm ×1.15 (was 1.25), Stonehaven fish ×1.45 (was 1.25).
- **Candidate text**: scouting states local wild-food depletion and the founding cost against current stores (tested against live Jev).

### Bug fixed from live testing
Jev rounds probabilities to two decimals, so a valid answer can sum to exactly 0.99. Floating-point arithmetic put that
1e-17 outside the ±0.01 tolerance and rejected it. In one live match this caused several extra retries and one paused
turn. The tolerance is now inclusive (`lib/server/jev/validate.ts`), with boundary tests. The paused turn was then
resumed through the real retry path with its identical frozen intent, which also exercised AC21 against live Jev.

### Verification for this update
- `npm test`: 69 tests pass. New tests cover scouting → founding, founding conflicts, organic growth never taking
  owned land, raid border capture, match-length bounds and early finish, world-scope events, a 200-turn invariant +
  exact re-simulation run, the length field, and the scaled budget.
- `npm run test:e2e`: 6 browser tests pass (including a 20-turn results flow).
- Lint, typecheck, build, catalog validation, and the secret scan are clean.
- Mock simulations (`reports/simulation-100x50-mock.txt`, `reports/simulation-30x200-mock.txt`): 0 crashes.
  Wins at 50 turns: Hearthwood 45, Windstep 37, Stonehaven 16, Ironfang 2 (Ironfang survived 91/100).
  Wins at 200 turns: Hearthwood 10, Windstep 4, Stonehaven 5, Ironfang 11.
  Typical 200-turn populations are 400–900 (the original rules reached about 100).
  Engine time: 17–23 ms per turn on average, 54 ms worst case.
- **Live Jev** (three 50-turn matches, `reports/live-eval-50-turns-dynamic*.txt`): the final run completed all 50 turns
  with zero invalid responses. Median latency is 175 ms, input is about 12,000 tokens per turn, and mean confidence is 0.54.
  Jev chose to scout and then **founded second settlements for Hearthwood and Windstep**.
  Storage for a 50-turn live game is about 4.2 MB.
- **Observed model behaviour** (not steered): Jev still strongly prefers food gathering. In the final run Ironfang
  gathered on 46 of 50 turns and did not raid even when raids were offered. Controlled comparisons on a recorded
  state showed this preference is context-driven (e.g. 4% for a food-rich tribe vs 86% for one with 7 food). The action
  order shifts probabilities moderately (up to ~20 points) but rarely changes the top choice.

## What was delivered

A complete Next.js 16 / React 19 / TypeScript application implementing the PRD's full loop: tribe selection
before map reveal, seeded 150×100 world generation, 100-turn matches with player/Nature alternation, one batched
live Jev request per turn, deterministic simultaneous resolution, environment effects, economy, research, raids,
recruitment, scoring, results, replay, export, SQLite persistence with atomic turns, tests, and documentation.

## Requirement coverage

| ID | Status | Where / how |
| --- | --- | --- |
| R01 | Done | App Router, route handlers on the Node runtime (`app/api/**`) |
| R02 | Done | `lib/server/jev/adapter.ts` (server-only); key never in client bundles, responses, exports, logs, or DB — checked by `npm run check:secrets` and tests |
| R03 | Done | Only external call is the fixed TypeSafe endpoint (`JEV_ENDPOINT` in `lib/server/config.ts`) |
| R04 | Done | All copy/rules in `content/` (tribes, 32 events × 3 options, actions, technologies, balance, narration, help) |
| R05 | Done | `lib/game/world/` layered noise + cellular smoothing + rivers with fords; Canvas renderer |
| R06 | Done | `content/tribes.ts` with trait modifiers in `content/balance.ts` |
| R07 | Done | Start screen commits a tribe before any map is shown; supported tribe is not a world-generation input |
| R08 | Done | `lib/game/calendar.ts`; Nature option drawn from a seeded stream and frozen when the event is prepared |
| R09 | Done | Effects target seeded footprints and terrain filters only (`lib/game/effects/`) |
| R10 | Done | One Choice per living tribe; argmax with tie rules (`lib/server/jev/validate.ts`); no sampling |
| R11 | Done | Engine computes everything (`lib/game/resolve/`, `economy.ts`, `score.ts`) |
| R12 | Done | Decision inspector: exact request JSON, offered actions, probabilities, confidence, model, latency, attempts/tokens |
| R13 | Done | Failures pause the turn (`turn_failed`) with Retry; no fallback model or heuristic in live games |
| R14 | Done | App, catalog, README, tests, `.env.example`, migrations, optional Dockerfile |

Acceptance criteria: AC01–AC26 are implemented. The verification for each is below; items not fully verifiable here
are listed under limitations.

## Verification actually performed

**With the real Jev API (your key, `jev-1.13.0`)**
- Contract probe (`npm run probe:jev`): batched 4-question request accepted; validated output. Confirmed:
  a single-option Choice is accepted (so Rest-only tribes still go to Jev; no forced actions were needed);
  `usage` is returned at the top level; the request ID comes back in the `x-typesafe-request-id` header;
  an empty Choice returns 400; an unknown model returns 400; a bad key returns 401.
- Two live turns through the full server (API smoke test), then two separate 20-turn live evaluations
  (`reports/live-eval-20-turns.txt`, `reports/live-eval-20-turns-v2.txt`): all 80 batched requests succeeded;
  median latency ≈145 ms, max ≈270 ms; ≈10,000 measured input tokens per turn; mean confidence ≈0.40.
- Observed adaptation in live play: all tribes switched to food gathering in the first winter; Ironfang researched
  Agriculture and then farmed; Hearthwood repeatedly chose Defend after being raided (memory-driven); Windstep built
  camp shelter when needed. After run 1 showed food gathering dominating even with large stores, candidate text gained
  two factual engine values (current stores in turns; score points per technology). Run 2 showed more varied
  development (expansion, research, relocation, repair). Jev behaviour quality was not otherwise evaluated.
- Key scan after live runs: 0 occurrences in logs, the database, build output, and committable files.

**With mocks / local stubs (no network)**
- `npm test` (Vitest): 60 tests, all passing — world generation (determinism across supported tribes, placement
  rules on 25 seeds, fallback template), calendar, keyed RNG, allocation order-independence and conservation,
  a 100-turn invariant run plus exact re-simulation of every state hash, order-independent resolution, sites producing
  while training, research pause/resume/charge-once/unlock, starvation formula, winter exposure, elimination/ruins,
  shared raid loot with no duplication, recruit conservation, candidate legality/cap/Rest, modifier bounds and
  Irrigation floor, asymmetric event effects, duration semantics, score formula, shared ties, full catalog
  validation, Jev output validation (9 malformed cases), request privacy (AC13), adapter retry policy against a
  local HTTP stub (401 no retry, 429+Retry-After, 529, 5xx cap, timeout, malformed-once), orchestration
  (idempotency, conflicts, stale versions, option validation, ownership, frozen retry, restart-after-persist with no
  new provider call, budget exhaustion, live-without-key refusal, replay verification, export secrecy), and real
  route handlers (origin/CSRF checks, strict bodies, cookie flags, ownership).
- `npm run test:e2e` (Playwright, Chromium): 6 tests passing — setup and odd/even turns with inspector and
  same-origin-only browser traffic; pause holding a Nature turn plus reload resuming the same frozen option;
  keyboard selection/confirmation; two-tab conflict committing exactly one turn; failed live turn (in-process
  Jev fake) with Retry resuming the frozen intent; final results after 100 turns, timeline, and replay.
- `npm run simulate -- --games 100` (MOCK policy, `reports/simulation-100-mock.txt`): 0 crashes or dead ends;
  engine resolution 5.8 ms/turn on average, 15 ms max (target < 250 ms). Wins: Hearthwood 58, Windstep 28,
  Stonehaven 10, Ironfang 6; Ironfang survived 87/100. These numbers describe the mock policy, not Jev.
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run validate:catalog`, `npm run check:secrets`: clean.
- Visual checks via headless screenshots at 1440×950 and 390×844 (no horizontal overflow on mobile).

**Not run**
- The container build (Docker is not installed here).
- A formal frame-rate measurement of map panning (the map uses cached offscreen layers; subjectively smooth).
- OS-level egress capture of the server; code review confirms the Jev adapter is the only outbound call.
- A long live match (100 live turns); live evaluation covered 2 × 20 turns plus smoke tests.

## Balance adjustments (all in `content/balance.ts`, logged in `BALANCE_CHANGELOG`)

1. Wildlife capacity meadow 4.5 / forest 7 / mountain 3; fish 16 per water tile, so a site can sustain about 18 food/turn at moderate depletion.
2. Labor: each farm, hunting site, or fishery needs 8 people for full output (stopped unlimited farm stacking).
3. Stonehaven starting fisheries need ≥80 fish within radius 3 (tiny streams made starts nonviable).
4. Wildlife regeneration 0.2 → 0.3 and fish 0.25 → 0.35 (mock-policy win share for Hearthwood fell from 74% to ~50%).
5. +1% birth rate while stores cover ≥6 turns (surplus becomes growth instead of runaway stockpiles).
6. Memories expire after 16 turns; research memories clear on completion or cancellation.

## Implementation decisions worth knowing

- **Working range** uses base terrain costs, so weather doesn't switch whole farms on and off. Travel modifiers
  (weather, and +1 on all land in winter) affect relocation reach, raid and recruit range, and expansion.
- **Area modifiers** on foraging and active gathering are evaluated at the tribe's settlement tile; site modifiers
  are evaluated at the site tile.
- **Exposure** uses stochastic rounding with a keyed draw (the expected loss is exact, with no forced minimum of one).
- **Fortification** is a fixed defenses asset on the settlement tile. Relocating leaves it behind; returning reactivates it.
- **Relocation** claims the destination and adjacent unclaimed land. Stores and portable camps move with the settlement.
- **Natural shelter**: cave tiles give 8 capacity and sheltered tiles give 4, when owned and in range (maximum 24 per tribe).
- **Candidate targets** follow documented fixed rules (`content/actions.ts`, `targetRule`): best-scoring and nearest,
  at most two per location action; the cap drops second variants first.
- **Stack**: TypeScript is pinned at **6.0.3** because typescript-eslint does not support TS 7 yet. SQLite uses
  Node's built-in `node:sqlite` (Node ≥ 24), avoiding a native driver build.
- **UI preferences** (pause, speed, reduced motion, onboarding seen) are per-viewer `localStorage` conveniences.
  Pause is client-side only and never cancels an accepted server turn.

## Known limitations

- Measured input is about 10k tokens per turn, above the PRD's 2k–8k target (a target, not a limit; the documented
  API limits are 32k/64k). Trimming (older memories, then risk text) starts only above a 14k estimate. Shortening
  technology descriptions is the next lever if cost matters.
- In live play Jev chooses food gathering often, and some tribes develop slowly. This reflects model preference
  over honestly described options; prompts were not tuned beyond adding factual engine values.
- The theme is light only (no dark mode). Chart colours were validated for colour-vision deficiency on the light surface.
- Single-instance deployment only: turn leases, rate limits, and budgets rely on one SQLite file.
- Exactly-once provider billing is not guaranteed if the process dies after Jev answers but before the response is
  saved. Simulation advancement is exactly-once.
- `next dev` shows Next's development indicator; production builds do not.
- No sound (the PRD makes sound optional).

## Files not to commit

`.env.local` and `env.md` contain the API key and are listed in `.gitignore`, as are `data/` and test output.
The code is published at `github.com/JonesSteven/jev_civilization` (branch `main`, rules 2) under the
MIT License; see `LICENSE`, `THIRD_PARTY_NOTICES.md`, `DISCLAIMER.md`, `SECURITY.md`, and `CONTRIBUTING.md`.
