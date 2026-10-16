# DGS-491 — Implementation Report

Ticket: DGS-491

## What changed
- The Frontdoor client renews its own session. ClickUp's web app mints the Frontdoor token with `POST id.app.clickup.com/data/v3/workspaces/<team>/authentication/access_tokens` (empty body, cookies `cu_refresh` and `cu_session_meta`); the `/auth/v1/refresh_token` call named in the ticket returns a different token, without the `workspace_id` claim. The cookie does not rotate and lasts about a year; the token lives 48 hours.
- `packages/clickup-client`: `frontdoor-session.ts` (`renewSession`, `isDue`, `mergeCookies`, `RenewalError`, transport), `session-store.ts` (`FileSessionStore`, `writeEnvValues`: atomic, mode 600, other lines byte for byte; lock file next to `.env`, stale after 60 s). `FrontdoorClient` renews before a call when the token expires in under 10 minutes or is expired, and once on a 401/403 with one retry. No stored refresh cookie: old behaviour.
- CLI: `dg clickup frontdoor refresh`; `import-auth` also stores `CLICKUP_FRONTDOOR_REFRESH_COOKIE` and prints `renewal: yes/no`; `createFrontdoorClient` passes the store; README and `--help` updated.
- Only the two-cookie call is built (no User-Agent or CSRF/sessionId fallback). The first use proves it works outside a browser.

## Tests
Written first. Fake store, fake transport, temp dirs only. Fixture secrets are asserted absent from stdout, stderr and thrown errors on every path. Covered: `.env` other lines and mode 600, rotated cookie stored, one retry only, lock exclusion and stale takeover. Full suite: 155 files, 2322 tests, all pass (clickup-client 148, cli 822 in its package run).

## Whole-branch review (Claude subagent): no leak, no critical finding
Four verified findings fixed with tests: (1) the renewal POST had no timeout (now 15 s), (2) release of the lock removes only the holder's own lock (unique owner token), (3) a temp file with the secret is removed when the rename fails, (4) a failed pre-call renewal no longer blocks a call while the token still has time left.
Parked: a 403 triggers one renewal, as specified; duplicate or indented keys in `.env`; `'` in a value does not round-trip through the reader (JWTs and the two cookies have none); the stale-takeover race between two processes is narrow.

## First use (after merge, on the Maestro's go)
`import-auth` on the named capture, `refresh` (new expiry after 2026-10-18 18:15 UTC+7), then an `add-status` dry run.
