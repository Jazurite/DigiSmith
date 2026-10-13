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

Counts vs base (it/it.each cases): client.test.ts 46 -> 48; frontdoor.test.ts 26 -> 28 (24+2 describes: FrontdoorClient 24 -> 26, readFrontdoorAuth 2); field-set.test.ts 30 -> 30. Whole clickup-client package 84 -> 88. No describe lost.

## First use (conductor, after merge)
A command with a bogus token in a temporary HOME `.env`: the printed 401 error shows no token.
