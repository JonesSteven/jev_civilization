# Contributing

Thanks for your interest! Issues and pull requests are welcome.

## Development setup

```bash
npm install
cp .env.example .env.local      # add TYPESAFE_API_KEY for live play, or set ALLOW_MOCK_MODE=true
npm run dev
```

You do not need an API key to develop or run the tests: use **Mock simulation** mode, and the test suites use a
local stub instead of the real API.

## Before opening a pull request

```bash
npm run typecheck && npm run lint && npm test
npm run build && npm run test:e2e   # after `npx playwright install chromium`
npm run check:secrets
```

- Never commit keys, `.env*` files (other than `.env.example`), or `data/` databases.
- Game content and rules live in `content/`; the engine in `lib/game/` must stay pure (no DOM, network, or database).
- Balance changes go in `content/balance.ts` with an entry in `BALANCE_CHANGELOG`; run
  `npm run simulate -- --games 100 --turns 50` and describe the effect.
- If you add or upgrade production dependencies, run `npm run notices` to refresh `THIRD_PARTY_NOTICES.md`.

By contributing, you agree that your contributions are licensed under the MIT License (see `LICENSE`).
