# DGS-491 design: Frontdoor session renewal

Times UTC+7 first, UTC in brackets. No secret value is in this file: names, attributes, lengths, `exp` and same/changed only.
Facts come from capture `Raw_10_16_2026_18_15_56` (Jack, 2026-10-16 18:15 UTC+7 [11:15 UTC]), read with the shape-only readers in this folder
(`shape-reader.mjs`, `shape-auth.mjs`, `shape-find.mjs`, `shape-access.mjs`, `shape-78.mjs`).

## Facts

**The refresh call in the ticket is not the call that makes the Frontdoor token.**

| | `POST id.app.clickup.com/auth/v1/refresh_token` (calls 71, 229, 281, 304) | `POST id.app.clickup.com/data/v3/workspaces/5738747/authentication/access_tokens` (call 78) |
|---|---|---|
| Body | `{}` | empty (Content-Length 0, no Content-Type) |
| Cookies sent | the whole jar | only `cu_session_meta` and `cu_refresh` (plus analytics cookies that carry no auth) |
| X-CSRF, sessionId, X-Workspace-ID | calls 229, 281, 304 only; call 71 sent none and got 200 | none |
| `token` in the response | 303 chars, claims `user, validated, ws_key, session_token, workspaces, iat, exp` | **333 chars, same claims plus `workspace_id`** |
| Is it the Frontdoor Authorization? | no | **yes: the 116 Frontdoor calls (130..639) send `Bearer <this token>`; byte-equal** |

- The Frontdoor `Authorization` is `Bearer ` + the `token` of call 78. The refresh_token call (71..304) returns a token without `workspace_id`; the web app did not use it for Frontdoor.
  The ticket's call list is therefore wrong for the Frontdoor token: dg must call the **access_tokens** endpoint.
- Token life: `exp - iat` = 48.00 h (HS256, header keys `alg, typ, kid`). Call 78 at 18:15:35 [11:15:35] gave `exp` 2026-10-18 18:15:35 UTC+7 [11:15:35 UTC].
  The response body also has `expiration` (epoch seconds, equal to `exp`), `attachment_token` (327 chars), `refresh_token: null`, `refresh_token_metadata {cookie_set, session: true}`.
- **No rotation.** `cu_refresh` (313 chars) is the same value in all 8 requests that carry it and in every Set-Cookie of every response. Its Set-Cookie only moves the expiry:
  `Expires` = issue time + 1 year (2027-10-16 18:15 UTC+7 [11:15 UTC]), `Domain=app.clickup.com; Path=/; HttpOnly; Secure; SameSite=Lax`, no Max-Age. So the refresh cookie lives about a year and slides forward on each call.
  (`refresh_token_metadata.session: true` is ClickUp's flag; the cookie itself is not a browser-session cookie.)
  `cu_session_meta` (52 chars) is also unchanged, `Expires` +1 year, `Domain=.clickup.com`, not HttpOnly.
  The other cookies (`cu_jwt`, `cu_form_jwt`, `cu_attachment_jwt`, `cu_public`) change on each call but are outputs, not inputs, of the renewal.
- Gap between calls: 71 at 18:15:35, 229 at :39, 281 and 304 at :42 [11:15:xx]. All within 7 s; the web app never re-minted the Frontdoor token during the capture, so its trigger and cadence are unknown.
- X-CSRF is 1 char and equals the 1-char cookie `_tt_enable_cookie` (a TikTok pixel flag): a constant, not a double-submit token. sessionId (9 chars), X-Workspace-ID (the team id), Origin (`https://app.clickup.com`) and Referer (`https://app.clickup.com/`) are constant across calls 229, 281, 304.
- Authorization format: `Bearer ` prefix. `import-auth` already stores the whole header value, so `CLICKUP_FRONTDOOR_AUTH` keeps `Bearer <token>`.
- Not proven by the capture: that the call works with only the two cookies from outside a browser (no User-Agent or other header from the web app). The capture shows the browser did exactly this in call 78 (cookies `cu_session_meta` + `cu_refresh`, no CSRF, no sessionId). The first use is the proof.

## Design (the Maestro's defaults, with three changes the facts force)

1. **Endpoint:** `POST https://id.app.clickup.com/data/v3/workspaces/<CLICKUP_TEAM_ID>/authentication/access_tokens`, empty body, headers `Cookie`, `Origin: https://app.clickup.com`, `Referer: https://app.clickup.com/`. *(Change 1: not refresh_token.)*
   The response `token` becomes `CLICKUP_FRONTDOOR_AUTH` as `Bearer <token>`.
2. **Stored credential:** `CLICKUP_FRONTDOOR_REFRESH_COOKIE` = `cu_refresh=<v>; cu_session_meta=<v>` and nothing else. *(Change 2: no `CLICKUP_FRONTDOOR_CSRF` or `CLICKUP_FRONTDOOR_SESSION_ID`: the access_tokens call does not send them.)*
   Written by `import-auth` from the newest captured request that carries `cu_refresh`; a later Set-Cookie for those two names in the capture wins over the request cookie.
   `.env` is written atomically (temp file mode 600 in the same folder, rename; every other line kept byte for byte). `import-auth` prints only `stored, expires <UTC+7 [UTC]>, renewal: yes/no`.
3. **Rotation handling:** the facts say no rotation, but `refresh` still merges any `cu_refresh` / `cu_session_meta` Set-Cookie of the response into the stored cookie (cheap, and safe if ClickUp starts to rotate). *(Change 3: kept as a defence, not a requirement. The merge only touches those two names.)*
4. **`dg clickup frontdoor refresh`:** calls (1), stores the new `CLICKUP_FRONTDOOR_AUTH`, merges cookies, prints the old and new expiry only. On failure: `renewal failed (HTTP <code>): capture a new session with Proxyman, then dg clickup frontdoor import-auth`. Never a header or body.
5. **Automatic renewal in the Frontdoor client:** before a call, renew when `exp` is under 10 minutes away; on 401/403, renew once and retry once; if renewal fails, `FrontdoorAuthError` with the hint above. Lock file next to `.env` (create-exclusive, stale after 60 s) so two `dg` processes do not renew at once; the process that waits re-reads `.env` and uses the token the other one stored.
   The client takes a small session-store interface (`read`, `write`) and a transport function, so tests use a fake store and a fake transport. No network, no real file outside a temp dir.
6. **Tests:** no fixture secret (`fake-refresh-cookie`, `fake-jwt` values) in stdout or stderr on any path; `.env` keeps its other lines and mode 600; a rotated cookie is stored; one retry only after a 401; the lock excludes a second renewer and goes stale after 60 s; no renewal when the stored refresh cookie is missing (`renewal: no`).

## Risks

- **A year-long credential on disk.** `cu_refresh` mints a new 48 h Frontdoor token (and `attachment_token`) for the user's whole ClickUp session until the cookie is revoked. `.env` is mode 600 on the Workbox; the cookie never reaches stdout, stderr, logs, fixtures or git. Revoke by logging out of ClickUp or the web "log out of all sessions".
- **Shared session.** Minting a token may invalidate the web app's own session or trip a ClickUp check (device, IP, User-Agent). Not seen in the capture (four mints in 7 s, all 200). Mitigation: first use only on the Maestro's "go: first use", with a dry run after.
- **Undocumented endpoint.** ClickUp can change it without notice; failure is then the plain "capture a new session" message, the same as today.
- **Two cookies may not be enough from outside a browser.** If the first use returns 401/403, the fallback is to also send the User-Agent of the capture and, last, the full `X-CSRF` / `sessionId` set (then the defaults' two extra variables come back). This is the one open fact.
- **The renewal lock** protects `dg` against `dg`; a browser using the same cookie is not covered (no rotation, so no conflict).
