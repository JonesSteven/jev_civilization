# Jev Civilizations

### ▶ [Play the live demo](https://thunder-monocle.env-ca.veilstreamapp.com/)

**[https://thunder-monocle.env-ca.veilstreamapp.com/](https://thunder-monocle.env-ca.veilstreamapp.com/)**

Jev Civilizations is a small strategy game where four tribes run their own lives and you can only change the
world around them.

## What it does

- **Pick a tribe to support.** Farmers, hunters, mountain fishers, or raiders — each lives off the land differently.
- **You never give orders.** Instead, every other turn you choose how the environment changes: a wet spring, a
  harsh winter, a wildlife boom, a crop pest, a plague. Many events strike just one region, and each option says which
  tribes it will likely help or hurt. On the turns in between, Nature picks at random.
- **The tribes decide for themselves.** Each turn an AI model, **Jev**, chooses one action for every tribe from the
  moves that are actually possible for it — farm, hunt, build, research, move, scout for new land, found a new
  settlement, raid a neighbour, or offer (or accept) a union.
- **Luck shapes history.** In the spirit of *Guns, Germs, and Steel*, small strokes of fortune compound: a well-fed
  tribe grows fast and researches faster, while a blizzard or a plague in the wrong place can halve a tribe. Tribes can
  starve and break apart, be conquered, or join a much larger neighbour.
- **A game engine works out what happens.** Harvests, hunger, births, raids, and growing or shrinking borders are all
  calculated by ordinary game rules, and the map changes to show it.
- **See why things happened.** After every turn a plain-language summary says who gained or lost people and why
  ("Hit by the bitter winter, Windstep lost a third of its people to cold, while Stonehaven grew by 10%"). A decision
  inspector shows exactly what Jev was told, and the event log keeps every measured result.
- **The best civilization wins.** The match lasts 10–200 turns (100 by default) or ends early when one tribe is left.
  Tribes are ranked by population first, then resilience, technology, and territory.

No API key? The app also has a clearly labelled **mock mode** that uses a simple built-in policy instead of Jev, so
you can play and develop offline.

## How it's built

- Next.js 16 (App Router) + React 19 + TypeScript (strict), exact versions pinned in `package-lock.json`
- Pure TypeScript game engine in `lib/game/` (no DOM, database, or network)
- Server-only Jev adapter in `lib/server/jev/` — the only external call the app makes
- Local SQLite through Node's built-in `node:sqlite` (no native build step, no hosted database)
- Canvas 2D map, locally drawn SVG art, system fonts; no remote assets, analytics, or telemetry

## Requirements

- **Node.js 24 or newer** (developed on 26.5; `node:sqlite` is built in)
- npm 11
- A persistent, writable directory for the SQLite file
- A TypeSafe API key for live play (optional for the clearly labeled mock mode)

> The default deployment is a **single persistent Node server with a writable volume**. Ephemeral serverless
> filesystems and multi-instance deployments are not supported (SQLite state and turn leases live on one disk).

## Setup

```bash
npm install
cp .env.example .env.local
# edit .env.local: set TYPESAFE_API_KEY (server-only; never prefix it with NEXT_PUBLIC_)
```

Environment variables (see `.env.example`):

| Variable | Meaning | Default |
| --- | --- | --- |
| `TYPESAFE_API_KEY` | Secret used only by the server for `POST https://api.typesafe.ai/v1/systemone` | — |
| `JEV_MODEL` | Pinned model ID; the resolved model is saved with each turn | `jev-1.13.0` |
| `DATABASE_PATH` | SQLite file on a persistent writable volume | `./data/jevciv.sqlite` |
| `ALLOW_MOCK_MODE` | Allow labeled mock simulation games | `false` in production, `true` otherwise |
| `JEV_TIMEOUT_MS` | Per-attempt timeout | `10000` |
| `JEV_MAX_ATTEMPTS_PER_TURN` | Total automatic attempts per turn | `3` |
| `JEV_MAX_ATTEMPTS_PER_GAME` | Cap on the per-game attempt budget (the budget is 3 × match length, up to this cap) | `300` |
| `JEV_MAX_CONCURRENCY` | Process-wide concurrent Jev calls | `4` |
| `APP_ORIGIN` | Public origin for same-origin mutation checks | request host |
| `NEXT_TELEMETRY_DISABLED` | Disable framework telemetry | set to `1` |
| `RATE_LIMIT_TURNS_PER_MINUTE`, `RATE_LIMIT_GAMES_PER_HOUR` | Optional overrides of the per-session limits | `60`, `10` |

### Database initialization

Nothing to run by hand. On first use the server creates `DATABASE_PATH` (and its directory) and applies the
schema migrations in `lib/server/migrations.ts`. Migrations are append-only and versioned in `schema_migrations`.

## Running

```bash
npm run dev          # development server on http://localhost:3000
npm run build        # validates the content catalog, then builds
npm start            # production server (PORT/-p to change the port)
```

Set `APP_ORIGIN` to the exact origin players use (for example `https://civ.example.com`), otherwise
mutations from the browser are rejected as cross-site.

### Mock mode

With `ALLOW_MOCK_MODE=true`, the start screen offers **Mock simulation**. Decisions then come from a deterministic
local test policy (`lib/game/mockPolicy.ts`), never from Jev. Mode is chosen when a game is created and persisted;
mock games are labeled "MOCK SIMULATION" in the header, inspector, results, replays, and exports. A live game never
switches to mock. If live Jev is unavailable, the turn pauses with **Retry** and **Return to menu**.

### Container (optional)

```bash
docker build -t jev-civilizations .
docker run -p 3000:3000 -v jevciv-data:/data \
  -e TYPESAFE_API_KEY=... -e APP_ORIGIN=http://localhost:3000 jev-civilizations
```

The `Dockerfile` has not been verified in this environment (Docker was not installed during development).

## Testing

```bash
npm run typecheck
npm run lint
npm test                      # Vitest: engine, content catalog, Jev adapter (local HTTP stub), orchestration, routes
npx playwright install chromium   # once
npm run build && npm run test:e2e # Playwright browser tests against `next start` with an in-process Jev fake
npm run simulate -- --games 100 --turns 100  # balance run with the MOCK policy (not Jev), with drama metrics
npm run simulate -- --games 1 --turns 40 --story   # one mock game, turn by turn, with its summaries
npm run validate:catalog
npm run check:secrets             # after a build: scans bundles, committable files, and the DB for the key
npm run probe:jev                 # optional: ONE real Jev request (uses your key; small cost)
npm run live-sim -- --games 2 --turns 100 --parallel 2   # optional: full games decided by real Jev (≈13k tokens per turn)
```

No test in `npm test` or `npm run test:e2e` contacts the real API. Adapter tests route the fixed endpoint to a local
HTTP stub; browser tests preload `tests/e2e/stub-fetch.mjs`, which answers the fixed endpoint in-process.

## Exporting and replaying

- **Export**: the header's *Export* button (or `GET /api/games/:id/export`) downloads JSON with every turn's exact
  Jev request (without the Authorization header), validated output, attempts, usage, outcomes, and state hashes.
  Exports never include keys, cookies, session IDs, or database paths.
- **Replay**: *Replay match* (or `/game/:id/replay`) steps through recorded map deltas, events, and decisions.
  Replays make no model calls and are labeled REPLAY. `verifyReplay()` in `lib/server/replay.ts` re-runs the engine
  from the recorded initial state and recorded choices and checks every post-turn state hash (covered by tests).
- A new match on the same seed reproduces the same initial world but is a new live run, not a replay.

## Backing up and restoring data

All state is in the SQLite file at `DATABASE_PATH` (WAL mode, so also `-wal`/`-shm` files while running).

```bash
# Consistent online backup
node -e "const {DatabaseSync}=require('node:sqlite');new DatabaseSync(process.argv[1]).exec(\"VACUUM INTO '\"+process.argv[2]+\"'\")" data/jevciv.sqlite backup.sqlite
# Restore: stop the server, replace the file, remove stale -wal/-shm files, start the server
```

Players keep access through their anonymous session cookie; restoring the database restores their matches.
A complete 50-turn game uses about 4 MB of storage (turn records, map changes, and a full snapshot every ten turns).

## Project layout

```
app/                 pages (/, /game/[id], /game/[id]/replay) and same-origin API route handlers
components/          start screen, Canvas map, event card, scoreboard, inspector, results, replay
content/             authored catalog: tribes, events (33×3), actions, technologies, balance, narration, help
lib/game/            pure engine: world generation, candidates, resolution, effects, economy, scoring, views
lib/server/          config, SQLite, sessions, limits, Jev adapter, turn orchestration, replay/export
lib/client/          browser API client, world decoding, game controller hook
scripts/             catalog validation, balance simulation (mock and live), live probe, secret scan
tests/               engine, content, server (stub Jev), e2e (Playwright)
public/art/          local SVG emblems and illustrations
```

## License and disclaimer

Released under the **MIT License** (see `LICENSE`), © 2026 Steven Jones. Third-party packages are used under their
own licenses (see `THIRD_PARTY_NOTICES.md`).

This project is **not affiliated with or endorsed by TypeSafe**. Live play uses your own TypeSafe API key, and you are
responsible for its terms and costs. Game content is fiction. See `DISCLAIMER.md` for details, `SECURITY.md` to report
vulnerabilities and for key handling, and `CONTRIBUTING.md` to contribute.
