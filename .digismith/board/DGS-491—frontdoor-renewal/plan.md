# DGS-491 plan: Frontdoor session renewal

Design: `design.md` in this folder (approved by the Maestro with Jack's yes, 2026-10-16 ~18:4x UTC+7).
Additions from the approval: (1) renew before a call also when the token is already expired; no stored refresh cookie = today's behaviour; (2) only the two-cookie call, no User-Agent or CSRF/sessionId fallback; (3) commit design.md and the `shape-*.mjs` readers with the plan and report; (4) the ClickUp ticket is not edited.

## Change
- `packages/clickup-client/src/frontdoor-session.ts` (new): `SessionStore` interface, `renewSession` (POST access_tokens, empty body, Cookie/Origin/Referer), `isDue`, `tokenExpiry`, `mergeCookies`, `RenewalError`, the axios transport.
- `packages/clickup-client/src/session-store.ts` (new): `FileSessionStore` (reads/writes `.env`, create-exclusive lock file, stale after 60 s) and `writeEnvValues` (atomic, mode 600, other lines byte for byte).
- `FrontdoorClient`: optional `session`, `transport`, `now`; renews before a call when due or expired, renews and retries once on 401/403; without a stored refresh cookie nothing changes.
- CLI: `frontdoor refresh` (new), `import-auth` stores `CLICKUP_FRONTDOOR_REFRESH_COOKIE` and prints `renewal: yes/no`, `createFrontdoorClient` passes a `FileSessionStore`, `captures.ts` keeps Set-Cookie lines, README and `--help`.

## Tests (written first)
`frontdoor-session.test.ts`, `session-store.test.ts`, the renewal block in `frontdoor.test.ts`, `refresh.test.ts`, the renewal-cookie block in `import-auth.test.ts`, and a Set-Cookie case in `captures.test.ts`. Fake store, fake transport, temp dirs only; fixture secrets (`fake-refresh-cookie`, `fake-meta-cookie`, fake JWTs) are asserted absent from stdout and stderr.

## First use (only on the Maestro's "go: first use")
`import-auth` on the named capture, `refresh` (new expiry later than 2026-10-18 18:15 UTC+7), then `add-status ... --name renewal-check` as a dry run.
