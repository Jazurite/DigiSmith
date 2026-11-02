### Finding Verdicts

- **F1: the `HERDR_SOCKET_PATH` drop was untested** — ADDRESSED. The fake herdr now appends `${HERDR_SOCKET_PATH-unset}` to `$FAKE_LOG.env` (herdr-ws.test.ts:12); the test sets the caller's `HERDR_SOCKET_PATH`, asserts every line is `unset` and that the file is not empty (herdr-ws.test.ts:174-175). The assertion can fail now. The Builder reports 1 failed with the filter deleted; I did not repeat that run.
- **F2: merged tab/pane list lost the reply envelope** — ADDRESSED. `env0` keeps the first reply (herdr-ws:64, 69), and only list values are merged into `result` (herdr-ws:75-77). The fake returns `id` and the test asserts it (herdr-ws.test.ts:152).
- **F3: a repeated `--workspace` bypassed the create check** — ADDRESSED. A single guard before the create/start/target branches refuses more than one `--workspace` or `--pane` (herdr-ws:87). Tests cover both orders for create and a double `--pane` for start (herdr-ws.test.ts:130-135).
- **F4: the `HERDR_WS` pattern was unmentioned** — ADDRESSED. The docstring states the `^w\d+$` rule (herdr-ws:3).

### New Breakage in the Fix Diff

None. Checks I ran: the guard at herdr-ws:87 sits after the `list` branch, so lists are unaffected; it counts exact argv elements, so a prompt text that merely contains the word is not refused; `env0` is set on the first successful reply before the merge, and a non-JSON reply still ends in `deny`. I ran the test file: 18/18 pass at e7bdc94e, no warnings.

### Out-of-Scope Observations

None.

```json findings
[]
```
