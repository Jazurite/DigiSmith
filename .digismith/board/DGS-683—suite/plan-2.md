# DGS-683 ticket 2: plan extract (only this ticket's tasks)

Source: `plan.md` of this folder (approved 2026-11-01). Read also its 'Global Constraints' and 'Shared facts'. Task numbers are the plan's own.

## Ticket A3: the herdr-ws scope

Hermetic test design for T10-T12: `scripts/opencode-boot/herdr-ws.test.ts` builds a temp dir, writes a fake `herdr` (a `sh` script, below), copies `herdr-ws` with the herdr path replaced by the fake's path (`text.replace('"/Users/workbox/.local/bin/herdr"', JSON.stringify(fakePath))`), and runs it with `spawnSync("python3", [copy, ...args], { env })`. The real herdr is never called.

Fake (written by the test):
```sh
#!/bin/sh
# argv: --session S <group> <verb> ...
echo "$@" >> "$FAKE_LOG"
S="$2"; shift 2
case "$1 $2" in
  "agent list") echo '{"result":{"agents":[{"name":"dgs-1","pane_id":"w2:p1","workspace_id":"w2"},{"name":"dgs-2","pane_id":"w3:p1","workspace_id":"w3"},{"name":"tc-dgs-9","pane_id":"w7:p2","workspace_id":"w7"},{"name":"digismith-conductor","pane_id":"w7:p1","workspace_id":"w7"}]}}' ;;
  "agent get") case "$3" in dgs-1) W=w2;; dgs-2) W=w3;; tc-dgs-9|digismith-conductor) W=w7;; esac; echo "{\"result\":{\"agent\":{\"name\":\"$3\",\"workspace_id\":\"$W\"}}}" ;;
  "tab get") case "$3" in w7:t2) L=tc-dgs-9;; *) L=digismith-conductor;; esac; echo "{\"result\":{\"tab\":{\"tab_id\":\"$3\",\"label\":\"$L\"}}}" ;;
  *) echo '{"result":{}}' ;;
esac
```
Helper in the test: `run(env, args)` returns `{status, stdout, stderr, log}`; `ok(r)` means `status === 0`; `refused(r)` means `status === 3 && /herdr-ws: refused/`.

### Task 10 (T10): scope parsing and `--session`

**Files:**
- Modify: `scripts/opencode-boot/herdr-ws`
- Test: `scripts/opencode-boot/herdr-ws.test.ts` (create)

**Interfaces:** per spec 7.1 items 1-3. `HERDR_SCOPE` absent -> `[("default", $HERDR_WS)]`; neither set -> refused "HERDR_SCOPE or HERDR_WS not set". `--session S` as the first argument selects the session (must appear in the scope). Argv to herdr is built by the wrapper as `[HERDR, "--session", S, ...rest]`; the wrapper never forwards a `--session` or `--socket` of the caller.

**Maestro note (plan approval, 2026-11-01):** with `HERDR_SCOPE` holding several `default:<w>` pairs, the membership check is "the target workspace is one of the scope's workspaces FOR THAT SESSION" (`scopeFor` gives the own Suite workspace plus every Floor workspace). The T10 tests must cover MORE THAN ONE `default` pair: a target in each `default` workspace passes, a target in a `default` workspace NOT in the scope is refused, and the same workspace id in `Suite` is not accepted through a `default` pair.

- [ ] **Step 1: Write the failing tests:** (1) `HERDR_WS=w2`, `agent list` -> ok, output only `w2` agents (today's behaviour); (2) `HERDR_WS=w2`, `--session Suite agent list` -> refused (Suite not in scope); (3) `HERDR_SCOPE=Suite:w7,default:w2,default:w3`: `agent list` (default) -> `dgs-1` and `dgs-2`, not the w7 ones; `--session Suite agent list` -> only w7 agents; (4) a third session `--session other agent list` -> refused; (5) a second `--session` later in argv (`tab create --session x`) -> refused; (6) `pane read w4:p1` with scope w2,w3 -> refused; (7) `tab create --workspace w3 --label x` with scope `default:w2,default:w3` -> ok; `--workspace w4` -> refused; (8) bad scope text `HERDR_SCOPE=Suite:7` -> refused; (9) `session list` and `workspace create` groups -> refused; (10) the log of the fake shows every forwarded call starts with `--session <S>`.
- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run scripts/opencode-boot/herdr-ws.test.ts`
- [ ] **Step 3: Implement** in `herdr-ws`: `parse_scope()`, session extraction before the group check, `run(a)` using the chosen session, `WSS = {w for s, w in SCOPE if s == SESSION}`, list filtering by membership, `create` membership check, `start`/other verbs by `ws_of(t) in WSS`. Keep the old `HERDR_ENV` XDG handling and the `H[0]` path constant unchanged (the test replaces it).
- [ ] **Step 4: Run, expect PASS.** Also run the old script: `node scripts/opencode-boot/test-herdr-ws.mjs` (read-only against live herdr, allowed) -> `ALL PASS`.
- [ ] **Step 5: Commit.** `git commit scripts/opencode-boot/herdr-ws scripts/opencode-boot/herdr-ws.test.ts -m "feat(dgs-683): scope herdr-ws by session and workspace"`

### Task 11 (T11): the Suite close rule

**Files:** Modify `scripts/opencode-boot/herdr-ws`; Test `scripts/opencode-boot/herdr-ws.test.ts`.

**Interfaces:** spec 7.1 item 4. In session `Suite`: `tab close <id>`, `pane close`, `agent stop <name>` are refused unless the target's label (read with `tab get`; for `agent stop` the agent name) starts with `tc-` or `nw-`. Session `default` keeps the old `WS:t1` rule for every `WS` in its scope.

- [ ] **Step 1: Write the failing tests:** `--session Suite tab close w7:t2` (label `tc-dgs-9`) -> ok; `--session Suite tab close w7:t1` (label `digismith-conductor`) -> refused; `--session Suite agent stop digismith-conductor` -> refused; `--session Suite agent stop tc-dgs-9` -> ok; `tab close w2:t1` (default) -> refused (old rule); `tab close w2:t5` (default) -> ok.
- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run scripts/opencode-boot/herdr-ws.test.ts`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit.** `git commit scripts/opencode-boot/herdr-ws scripts/opencode-boot/herdr-ws.test.ts -m "feat(dgs-683): only ticket conductors can be closed in Suite"`

### Task 12 (T12): the cross-project audit log

**Files:** Modify `scripts/opencode-boot/herdr-ws`; Test `scripts/opencode-boot/herdr-ws.test.ts`.

**Interfaces:** spec 7.1 item 5. Env read: `HERDR_WS` (the caller's own Floor workspace; unset = no logging), `DIGISMITH_NAME` (caller name, `unknown` when unset), `DIGISMITH_DEPOT_DIR` (depot root, default `~/.digismith-depot`). A non-read verb (not `list`, `get`, `read`) in session `default` whose target workspace differs from `HERDR_WS` appends one JSON line to `<depot>/drivers/<KEY>.log` where KEY = first `DGS-\d+` in the target agent name uppercased, else file `_unmapped.log`: `{"time":"<iso+07:00>","who":"<DIGISMITH_NAME>","target":"<name or pane>","workspace":"w3","verb":"agent prompt"}`. A failure to write the log does not block the call (it prints one line to stderr).

- [ ] **Step 1: Write the failing tests** (temp `DIGISMITH_DEPOT_DIR`): `HERDR_WS=w2`, scope `default:w2,default:w3`, `agent prompt dgs-2 hi` (agent in w3) -> ok and `drivers/_unmapped.log` has one line with `workspace:"w3"`; the same on an agent named `dgs-683-b` in w3 writes `drivers/DGS-683.log`; `agent prompt dgs-1 hi` (own w2) writes nothing; `agent list` and `pane read w3:p1` write nothing; unset `HERDR_WS` (factory) writes nothing; an unwritable depot dir still exits 0 for an allowed call.
- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run scripts/opencode-boot/herdr-ws.test.ts`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS** (whole file) and `node scripts/opencode-boot/test-herdr-ws.mjs` -> `ALL PASS`.
- [ ] **Step 5: Commit.** `git commit scripts/opencode-boot/herdr-ws scripts/opencode-boot/herdr-ws.test.ts -m "feat(dgs-683): log a cross-project act in herdr-ws"`

---

