# Security Policy

## Reporting a vulnerability

Please report security issues **privately** using GitHub's "Report a vulnerability" button on this repository's
**Security** tab (private vulnerability reporting). Do not open a public issue for security problems. Include steps
to reproduce and the affected version or commit. You should receive an acknowledgement within a few days.

This is a demonstration project maintained on a best-effort basis; there is no bug bounty.

## Handling the API key

- Put `TYPESAFE_API_KEY` in `.env.local` (git-ignored) or your deployment's secret store. Never prefix it with
  `NEXT_PUBLIC_`, and never commit it. `.env.example` intentionally contains no value.
- The key is read only by server code (`lib/server/`, guarded by `server-only`) and is added to the outgoing
  request header at call time. It is never stored in the database, logs, exports, or browser bundles.
- Run `npm run build && npm run check:secrets` before publishing or deploying. It scans the build output,
  committable files, and the local database for key material.
- If a key is ever exposed, revoke it with TypeSafe immediately and issue a new one. Removing it from git history
  does not un-leak it.

## Deployment notes

- Set `APP_ORIGIN` to the exact public origin; mutations from other origins are rejected.
- Serve over HTTPS in production so the session cookie is sent with `Secure`.
- Keep `ALLOW_MOCK_MODE=false` in production unless you deliberately want mock games available.
- Per-session rate limits and a per-game attempt budget are enforced, but they are not a substitute for network-level
  protection if you expose the app publicly.
