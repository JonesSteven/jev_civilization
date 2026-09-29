# Jev Civilizations — Handoff Note

Date: 29 September 2026 · rules-1.0.0 · content-1.0.0 · model `jev-1.13.0`

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
The repository was initialised locally with `git init`; nothing has been committed or pushed.
