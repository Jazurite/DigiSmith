### Spec Compliance

- ✅ Spec compliant for T10 and spec 7.1 items 1-3. Checked in the diff: `HERDR_SCOPE` parse with fallback `default:$HERDR_WS` and the "not set" refusal (herdr-ws:17-28); a leading `--session S` that must be in the scope, `default` when absent (herdr-ws:30-36); a later `--session`/`--socket` (also `--x=...`) refused (herdr-ws:37); the argv built as `[HERDR, --session, SESSION, ...]` by `run()` (herdr-ws:44); `HERDR_SOCKET_PATH` dropped from the herdr env (herdr-ws:42); lists, create, start and targets checked against `WSS` of the chosen session; groups `agent|pane|tab` only. The Maestro's multi-pair note is covered by tests ("every default pair is reachable...", "the same workspace id in Suite is not accepted through a default pair").
- ⚠️ Cannot verify from the diff: the Suite close rule (`tab close` label check) and the audit log are T11/T12 and not in this pack. Until T11, `tab close` in Suite only blocks `w7:t1`.

### Strengths

- Scope check is one set (`WSS`) built per session, so one default workspace can never grant a same-id Suite workspace; the cross-session tests prove both directions.
- Hermetic tests: the fake herdr replaces the binary in a temp copy of the script; the log assertion checks every forwarded call starts with `--session <S>`.
- Stricter bounds checks than before: `--workspace` and `--pane` as the last arg no longer raise IndexError (herdr-ws:84, 89).
- I ran the test file: 17/17 pass, no warnings.

### Issues

#### Critical (Must Fix)
None.

#### Important (Should Fix)
- F1, `scripts/opencode-boot/herdr-ws.test.ts:162-171`: the test title says "a caller socket env is dropped", and spec 7.1 item 3 makes dropping `HERDR_SOCKET_PATH` a security rule, but the test asserts nothing about it. The fake herdr never logs its environment, so the test passes whether or not line 42 filters the variable (delete the filter and 17/17 still pass). Fix: make the fake write `${HERDR_SOCKET_PATH-unset}` to the log and assert `unset`.

#### Minor (Nice to Have)
- F2, `scripts/opencode-boot/herdr-ws:62-72`: with several workspaces in a session, `pane list` and `tab list` print a re-built `{"result": merged}`. Any top-level field herdr returns besides `result` (for example `id`) is lost, and a malformed or failing herdr reply in the second workspace after a good first one is handled only by `deny`/the exit code of the last call. A caller that parses only `result.tabs` works today; keep the original envelope of the first reply to be safe.
- F3, `scripts/opencode-boot/herdr-ws:84`: `create` checks only the first `--workspace`. `tab create --workspace w2 --workspace w9` passes the check on w2 and forwards both to herdr; if herdr takes the last one, the target is outside the scope. Pre-existing, but this task rewrote the line and claims the wrapper "builds the argv itself". Refuse a repeated `--workspace` (and `--pane` in `start`) and add one test.
- F4, `scripts/opencode-boot/herdr-ws:12,21`: `HERDR_WS` is now validated against `^w\d+$`. Before, any value worked. Real ids are `wN`, so no known caller breaks, but a one-line note in the docstring would record the change.

### Assessment

**Task quality:** Needs fixes

**Reasoning:** The implementation matches 7.1 items 1-3 and the Maestro's multi-pair note. One Important gap: the `HERDR_SOCKET_PATH` rule has a test that cannot fail. Minor items do not block.

```json findings
[
  {
    "id": "F1",
    "path": "scripts/opencode-boot/herdr-ws.test.ts",
    "line": 162,
    "severity": "Important",
    "what": "The test named 'a caller socket env is dropped' never checks the herdr environment, so the HERDR_SOCKET_PATH filter is untested.",
    "scenario": "Remove the HERDR_SOCKET_PATH filter at herdr-ws:42; all 17 tests still pass, so a regression that lets a caller redirect herdr to its own socket goes unseen."
  },
  {
    "id": "F2",
    "path": "scripts/opencode-boot/herdr-ws",
    "line": 62,
    "severity": "Minor",
    "what": "The merged pane/tab list replaces the herdr reply with a new {result} object and drops any other top-level field.",
    "scenario": "Scope with two default workspaces; tab list; a caller that reads a top-level field other than result gets nothing."
  },
  {
    "id": "F3",
    "path": "scripts/opencode-boot/herdr-ws",
    "line": 84,
    "severity": "Minor",
    "what": "create validates only the first --workspace; a repeated --workspace is forwarded unchecked.",
    "scenario": "tab create --workspace w2 --workspace w9 with scope default:w2: passes the check and may create in w9 if herdr takes the last value."
  },
  {
    "id": "F4",
    "path": "scripts/opencode-boot/herdr-ws",
    "line": 21,
    "severity": "Minor",
    "what": "HERDR_WS is now restricted to ^w\\d+$ without a note; this is a small behaviour change from the old any-string rule.",
    "scenario": "HERDR_WS set to a non-wN value is refused as a bad scope entry where it used to work."
  }
]
```
