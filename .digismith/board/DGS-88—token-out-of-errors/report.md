# DGS-88 — Implementation Report

Ticket: DGS-88

## What changed
- `ClickUpApiError` (new `packages/clickup-client/src/errors.ts`, exported from the client index): fields `method`, `path`, `status`, `body`, `code`. No config, headers, request, response or cause.
- `ClickUpClient.request` and `FrontdoorClient.request` rethrow axios-shaped errors as `ClickUpApiError`. Message is unchanged: axios text plus `: <ClickUp body>`. Other errors pass through. Frontdoor 401/403 still throw `FrontdoorAuthError` (no auth value in it).
- Frontdoor had the same flaw (raw error rethrown): fixed with the same two lines.
- `field-set.ts` reads `err.body` instead of `err.response.data`. CLI commands print only `err.message`: unchanged.
- JSDoc on `post()`/`put()`: the body goes in `{ data: body }`. JSDoc on `request()` names the new error.

## Tests
Leak tests check `JSON.stringify`, `util.inspect` (depth null, showHidden), `stack`, `message` and `toJSON()` for the API token (client) and the Frontdoor auth (Frontdoor, 500 and 401/403). Network error without response covered.

Counts vs base: client.test.ts 46 -> 51 (only `ClickUpClient relations` grew, 8 -> 13); frontdoor.test.ts 26 -> 29 (`FrontdoorClient` 24 -> 27, `readFrontdoorAuth` 2); field-set.test.ts 30 -> 30. clickup-client package 84 -> 92. Full suite 132 files, 1860 tests, all pass. No describe lost.

## Whole-branch review (Claude): ready to merge, nothing critical or important
Leak paths clean. Six hardening fixes, test first:
1. `isAxiosLike` now requires `isAxiosError === true` (a plain Error with a `response` field is no longer wrapped).
2. Tests: a plain Error is rethrown unchanged by the client and by Frontdoor.
3. A leak test with a REAL `AxiosError` (via `vi.importActual`), all views checked.
4. Dead `axios.isAxiosError` mock lines removed from `frontdoor.test.ts`.
5. `JSON.stringify(body)` wrapped in try/catch with `String(body)` fallback; tests for a circular and a BigInt body.
6. `field-set.test.ts` builds `ClickUpApiError` objects.

## First use (conductor, after merge)
A command with a bogus token in a temporary HOME `.env`: the printed 401 error shows no token.
