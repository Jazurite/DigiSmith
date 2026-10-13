# DGS-88 plan: keep the API token out of thrown errors

Ticket: DGS-88

## Error class
`ClickUpApiError extends Error` in `packages/clickup-client/src/errors.ts`, exported from `index.ts`.
- Fields: `method`, `path`, `status` (number or undefined), `body` (ClickUp's body: `{err, ECODE}` object or string), `code` (axios code such as ECONNREFUSED, if any).
- No `config`, no `headers`, no `request`, no `response`. No `cause` (an AxiosError cause carries the headers). Only the plain fields above are copied.
- Message: `<original axios message>: <body>` when ClickUp sent a body, as today (`Request failed with status code 400: {"err":"...","ECODE":"..."}`). No body: `<axios message>`. The path is a URL path only (the token is in a header, never in the URL).
- Network errors (no response) also become ClickUpApiError, status undefined, so the raw request header block is dropped there too.

## Where thrown
`ClickUpClient.request` catch block: if the error looks like an axios error (duck type: object with `isAxiosError` or `response`; axios is fully mocked in tests so `axios.isAxiosError` is not usable), build and throw ClickUpApiError. Anything else rethrows as is.
Frontdoor (`frontdoor.ts` request) has the same flaw: it rethrows the raw error after the 401/403 check. The same pattern applies, so I fix it the same way (reuse the class; `FrontdoorAuthError` stays for 401/403).

## Who reads error.response / config
Grep (`.response`, `isAxiosError`, `.config`): only
- `field-set.ts:143` `applyFields` reads `err.response.data` to avoid duplicating the body. After the change `response` is gone; it would read `undefined` and add nothing. It reads `body` instead (one line change to `err.body`), message already contains it.
- the client and frontdoor catch blocks themselves.
CLI commands print only `(err as Error).message`: unchanged and still has status text and ClickUp's message.
Existing tests that assert `caught.toBe(err)` and `.response.status` (client.test.ts ~line 670, frontdoor.test.ts ~line 175-200) change to assert the new class and fields.

## Also
JSDoc on `post()` and `put()`: the body goes in `{ data: body }`, a bare body is sent empty and ClickUp answers 400. (No `addComment`: `addTaskComment` already exists.)

## Tests (TDD, seen failing first)
- client: a mocked axios error carrying `config.headers.Authorization = token`, `request._header` with the token and a response `{status:400,data:{err,ECODE}}`: the thrown error is a ClickUpApiError; `JSON.stringify(err)` and `util.inspect(err, {depth: null})` do not contain the token; `status`, `method`, `path`, `body` present; message holds status and ClickUp's text.
- client: network error with no response: ClickUpApiError, status undefined, no token.
- non-axios error rethrown unchanged.
- frontdoor: same token check for a 500; 401/403 still FrontdoorAuthError.
- field-set: failure still shows the body once.

## Files
packages/clickup-client/src/{errors.ts (new), client.ts, frontdoor.ts, index.ts, client.test.ts, frontdoor.test.ts}, packages/cli/src/clickup/field-set.ts (+ its test if needed), this folder (plan.md, report.md, report.html).
