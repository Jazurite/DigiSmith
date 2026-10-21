# DGS-582 probe findings (Task 1)

Read on `main` after the rebase (2026-10-22, 00:20 UTC+7 [2026-10-21 17:20 UTC]). Read only. No ClickUp write, no prompt, no merge.

**Gate result: not triggered.** `buildPack` writes `head:` into every `pack.md` (see Step 3). No finished ticket workspace was on disk to paste a real file, so this is checked on the code and its test, not on a real file.

## Step 1. DGS-486 names (`packages/cli/src/autonomous/`)

| Name | File | Signature |
|---|---|---|
| `autonomousDir` | state.ts | `(env = process.env) => string` (`AUTONOMOUS_DIR`, else `<DIGISMITH_DEPOT_DIR or ~/.digismith-depot>/autonomous`) |
| `atomicWrite` | state.ts | `(dir, name, text) => void` (tmp + rename) |
| `acquireLock` | state.ts | `(dir, lock: Lock) => "acquired" \| "busy"` (`wx` write) |
| `readLock` | state.ts | `(dir) => Lock \| null`. A corrupt file reads as `{ ticket: "?", taskId: "?", claimedAt: "", ... }`, never null |
| `clearLock` | state.ts | `(dir) => void` |
| `appendEvent` | state.ts | `(dir, now: Date, kind: EventKind, fields = {}) => void` |
| `Lock` | types.ts | `{ ticket; taskId; claimedAt; claimedAtUtc7; order; scanId }` (all string) |
| `EventKind` | types.ts | `"scan"\|"off"\|"busy"\|"skip"\|"claim"\|"claim-failed"\|"no-starter-status"\|"release"\|"comment-failed"\|"run-now"\|"away-on"\|"away-off"\|"away-expired"` |
| `Tracker` | types.ts | `hasStatus(name)`, `listToDo()`, `setStatus(taskId, status)`, `getStatus(taskId): Promise<string>`, `comment(ref, text)` |
| `ScanDeps` | scan.ts | `{ tracker, dir, ordersDir, conductorsJson, repo, now, scanId, exec, fileExists, dryRun, nexus }` |
| `runScan` | scan.ts | `(d: ScanDeps) => Promise<ScanResult>`; outcome `off\|busy\|no-starter-status\|none\|claimed\|claim-failed` |
| `runRelease`, `ReleaseDeps`, `ReleaseResult` | release.ts | `(d: { tracker, dir, now, nexus }, { ticket, result, reason?, commit? }) => Promise<{ lockCleared, runNow }>`; result `merged\|failed\|stopped\|awaiting-jack` |
| `promptConductor` | conductor.ts | `(exec, conductorsJson, message) => Promise<void>`. Reads `conductorsJson`, needs key `DigiSmith/digismith-conductor`, runs `~/.digismith-depot/bin/herdr-ws agent prompt digismith-conductor <message>` |
| `Exec` | conductor.ts | `(file, args) => Promise<{ code; stderr }>`. **No stdout.** |
| yargs group | index.ts | `createAutonomousCommand(depsFactory)`; commands `scan`, `away`, `back`, `release`, `report`, `status`; `AutonomousDeps` = `{ tracker(), dir, ordersDir, conductorsJson, now, scanId(), exec, fileExists, nexus }` |

Consequences for the plan:
- `Exec` returns no stdout, so the real observers (Task 11) cannot read `git`, `herdr-ws agent list` or `pane read` through it. Define a second injected type `ExecOut = (file, args) => Promise<{ code; stdout; stderr }>` in `observers-real.ts`. Orders still go through `promptConductor` and the DGS-486 `Exec`.
- `Lock.claimedAt` may be `""` in tests (`scan.test.ts` busy test). `readPhaseState` accepts a string, so this reads as `claimed`; the tick must treat an empty `claimedAt` as fine, not corrupt.
- `readLock` already turns a corrupt file into ticket `"?"`. `readPhaseState` (Task 2) reads the file itself and returns `corrupt`; both agree.

**Open point 4, lock read order: NO.** No DGS-486 test asserts that the lock is not read before `off`. `scan.test.ts` "daytime and not away: off, no tracker call, no lock, one off event" (line 57) has no lock on disk. The busy test (line 153) has a lock and expects exactly one `busy` event and no tracker call. Task 12 must keep that: with a lock whose ticket is `DGS-9`, `runScan` must still write only the `busy` event and make no tracker call in a test that injects no tick, or inject a tick fake that does nothing.

## Step 2. DGS-581 names (`packages/cli/src/run/`)

Importable:
- `runsDir(env)`, `findRunDir(runId, env): string | null`, `depotDir`, `isSafe` (paths.ts).
- `listRuns(env, ticket?): RunRow[]`, `showRun(runId, env)`, `tailEvents(runId, since, env)`, `summarize(events)` (read.ts). `RunRow = { record: RunRecord; summary: RunSummary }`. Newest first.
- `readRun(runDir): RunRecord`, `createRun(input, env, now)` (record.ts). `RunRecord` has `run, ticket, role ("builder"|"reviewer"|"scout"|"other"), order, seat, model, plugin_version, base_sha, branch, worktree, herdr{workspace,tab,pane}, budget, created_at`.
- `readEvents(runDir): EventLine[]`, `appendEvent(runDir, run, type, data, waitMs): EventLine` (events.ts). `EventLine = { schema, seq, ts, run, type, data }`.
- Event types: hooks `started, blocked, tool, turn_end, ended`; conductor `review_ready, merged, pushed, lost, phase`. `PHASES = building, review, merge`.

`dg run event <run-id> <type> [--data '<json object>']`: **review_ready accepts `--data` with `scope`: YES.** `validEventData` only checks `phase`; any JSON object is stored for the other types. The observer must not rely on it (the design takes `scope` from the pack and verdict rows), so Task 3 needs no change.

No `RunView` field is directly stored: `started` / `ended` / `merged` / `pushed` come from event types, `phaseEvent` from the newest `phase` event's `data.phase`. The adapter in Task 11 builds `RunView` from `listRuns(env, ticket)` + `readEvents(findRunDir(id))`. Direct import works, so no `dg run` call through `Exec` is needed.

## Step 3. Review pack and verdicts

- `buildPack` (reviewer/pack.ts) writes `<workspace>/reviews/<type>-<id>-r<round>/pack.md`. A ticket review is `reviews/ticket-final-r<N>/pack.md`. Manifest lines, in order: `# Review pack: ticket round N`, `ticket:`, `type:`, `id:`, `round:`, `model:`, `base:`, `head:`, optional `fix_base:`, `primitive:`, `report_out:`, then `## Files`, `## Standards`. `head:` and `base:` are validated 7 to 40 hex. Confirmed by `pack.test.ts`. **No real `pack.md` was on disk** (workspaces are deleted at finish); example shape, ticket text absent:
  ```
  ticket: DGS-1
  type: ticket
  id: final
  round: 1
  base: bbbbbbb1
  head: aaaaaaa1
  ```
- SDD workspace of a ticket: `<plan_dir>/.sdd-workspace/` where `plan_dir` is the folder of `plan.md` (`skills/subagent-driven-development/scripts/sdd-workspace`). In the builder's worktree that is `<worktree>/.digismith/board/<KEY>—<slug>/.sdd-workspace/` (a plan nested under `worker-*` has the workspace there). The observer finds it with `board-path.ts --action find --slug` or by globbing `.digismith/board/<KEY>—*/**/.sdd-workspace`. It is git-ignored, so it exists only in the builder's worktree.
- Verdict line in the ledger (`progress.md`): `Review (task|ticket) (\d+|final) r(\d+): (F\d+) -> (fixed|parked|rejected)( (reason))?`. Parser: `parseVerdictEntries(ledger): VerdictEntry[]` (verdicts.ts; throws on a bad line, which the observer turns into `ok: false`).
- Review reports: `readReviews(workspace): Review[]` (findings.ts); `Review = { kind, id, round, file, findings }`. It carries **no head**. A review with `findings.length === 0` is clean (`buildJson(...).approvedReviews`). So a `VerdictView { scope, result, head }` is built by joining the review of round N with `pack.md` of round N (`head:`) in the same folder. `scope` = `kind`. `result` = `clean` when no findings, else `findings`.
- `dg reviewer table --workspace <dir> --json` exists (`schema: 1`, `findings[]`, `approvedReviews[]`). Not needed; import `readReviews` directly.

## Step 4. herdr and the input box

- `herdr-ws` refuses without `HERDR_WS` in the environment (`w2` here). The tick must set it, or Nexus must. Record for Tasks 11 and 12: `observers-real.ts` passes `HERDR_WS` from `process.env.HERDR_WS ?? "w2"`.
- `herdr-ws agent list` prints one JSON object: `{"id":"cli:agent:list","result":{"agents":[ ... ]}}`. One entry per agent, keys: `agent`, `agent_session`, `agent_status` (seen: `idle`, `done`, `working`), `completion_seq`, `cwd`, `focused`, `foreground_cwd`, `interactive_ready`, `name`, `pane_id` (e.g. `w2:p1`), `revision`, `state_change_seq`, `tab_id`, `terminal_id`, `terminal_title`, `workspace_id`. So `conductorPresent` = an entry with `name === "digismith-conductor"`; `conductorWorking` = its `agent_status === "working"`; `builderPanePresent` = an entry for the builder name.
- `herdr-ws pane read <pane> --format ansi` prints the visible screen with ANSI codes. The bottom of a Claude Code pane is: a status line, a rule line `────…`, the input line starting `❯` + NBSP, a second rule, then a mode line (`auto mode on …`).
  - **empty**: the input line is `❯ ` with nothing after the NBSP. Captured from pane `dgs-214`: `fixtures/input-box-empty.ansi` (last 5 lines).
  - **suggestion**: the text after `❯ ` sits inside `ESC[2m … ESC[0m` (dim). Captured from pane `d3-conductor`; the suggestion text was replaced with `Run the tests`: `fixtures/input-box-suggestion.ansi`.
  - **typed**: **missing** (every idle pane was empty or a suggestion). `fixtures/input-box-typed.ansi` is **hand-made**: the empty capture with `fix the build` after `❯ `, no dim code.
  - Rule for Task 5: take the line that starts with `❯` + NBSP after the first rule; nothing after it → `empty`; text wrapped in dim (`ESC[2m`) → `suggestion`; any other text → `typed`; no such line → `unknown`.
- No key and no prompt was sent to any pane.
