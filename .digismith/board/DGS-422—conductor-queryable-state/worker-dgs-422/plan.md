# DGS-422 plan: conductor queryable state and the Maestro consult flow

Worker `dgs-422`, 2026-10-13. Spec: design.md sections 6 and 7 (DGS-404, b1e94d0). Status: PLAN, waiting for "approved: plan". Nothing outside this folder is changed.

## What I found while reading (two things change the brief)
1. **`herdr --remote <ssh-target>` only opens the interactive UI.** Probed: `herdr --remote x agent list` fails with "--remote can only be used with the default launch command". So a remote read cannot be `herdr --remote ... agent list`. Two real options exist: (a) plain `ssh <target> node --experimental-strip-types <repo>/scripts/conductor/cli.ts state --json` (runs the same read-only script on the Workbox), (b) `herdr --machine <label> <command>` (saved SSH machine; `herdr machine list` shows them). **Proposal: (a) for the state (needs only Node and the repo checkout on the Workbox, no Claude Code), (b) optional for live health (`herdr --machine <label> agent list`).** `herdr --remote` stays the way a human attaches to see the panes; the consult never types into it.
2. **There is no depot sessions folder yet** (`~/.digismith-depot/sessions` does not exist; DGS-417 creates it). The note path is therefore configurable, and the first use reads today's `.digismith/sessions/DigiSmith/note.md`.

## The change

### A. Conductor state: one answer in a fixed structure
Revised after reading the 417, 418 and 427 plans: **all code goes in `scripts/conductor/`** (plain TypeScript run by `node --experimental-strip-types`, no build, same as 417, 418 and 427; the `packages/cli` tree is untouched, so no CLI rebuild and no `dg` registration). Its CLI is `scripts/conductor/cli.ts` (`state`, `state-write`, `consult`). A `dg conductor` wrapper can follow later.

`collectState(opts, deps)` returns this object (the JSON the commands print). **It reuses DGS-427's `CatchUp` field types**, so DGS-428 builds a `CatchUp` as `{ conductor, window, identity, askedBy, ...state }` with no mapping:
```json
{
  "version": 1,
  "project": "DigiSmith",
  "conductor": "digismith-conductor",
  "asOf": "2026-10-13T14:05:00+07:00",
  "note": { "path": "/abs/path/note.md", "found": true, "blockFound": true, "updated": "2026-10-13T13:40:00+07:00" },
  "done":    [ { "key": "DGS-404", "line": "role architecture design", "report": "<link or path to report.html>" } ],
  "running": [ { "worker": "dgs-422", "key": "DGS-422", "stage": "plan", "since": "2026-10-13T13:35:00+07:00" } ],
  "waiting": [ { "question": "...", "since": "2026-10-13T13:50:00+07:00", "pane": "w2:p5" } ],
  "decided": [ { "decision": "...", "why": "...", "allowedBy": "order-..." } ],
  "parked":  [ { "what": "...", "why": "...", "next": "..." } ],
  "next":    [ "step 1", "step 2", "step 3" ],
  "health":  { "seats": [ { "seat": "jack", "fiveHourPct": 19, "weeklyPct": 59 } ], "server": "running", "tabs": ["w2:t1 maestro"] },
  "sources": { "note": "ok", "cards": "ok|stub", "git": "ok", "herdr": "ok|skipped|failed", "clickup": "skipped" },
  "warnings": []
}
```
`since` values are ISO-8601 strings with offset (427's `TimeInput`); a time that came from a tool (git, herdr) is written `{ "at": "...", "fromTool": true }` as 427 defines. `done` items come from git, so their `since`-like fields are not needed. The window is NOT in the state: 428 owns it and passes `--since <iso>` to `collectState` (it only limits `done`).

Section keys and order follow the seven sections of design section 7 (Done, Running, Waiting for Jack, Decided under the mandate, Parked or failed, Next, Health). A source that fails gives `"sources.<x>": "failed"` plus a warning; the other parts still return (partial answer beats none). An empty section is `[]` and the renderer prints `none`.

Where each part comes from (design section 7 item 4):
| Part | Source |
|---|---|
| running, waiting, decided, parked, next | the **structured block** of the conductor's note (below) |
| running (cross-check) | session cards of the domain through 417's `listCards(project, { scope: "open" })` (open cards, role worker). Flag a card with no row in the note, and a row with no open card, as warnings. Until 417 merges: a local stub `listCards()` returning `[]` and `sources.cards = "stub"`, switched to 417's import at rebase |
| done | `git log origin/main --since <window.from>` in the repo (subjects that name a `DGS-n` key; link = `.digismith/board/DGS-n*/worker-*/report.html` if one exists). Fetch is NOT run (read-only: no `git fetch`) |
| health.seats | the `Seats and usage:` line in the block, parsed to `{seat, fiveHourPct, weeklyPct}` (the conductor probes and writes it; format `jack: 5h 19%, weekly 59%; dev0: 5h 12%, weekly 36%`, the same as 427's Health line) |
| health.server, tabs | `herdr status server` and `herdr agent list` (on the Workbox, by the `herdr` binary, session `default`) through the injected runner (read-only allowlist, below); `skipped` when herdr is absent |
| ClickUp | NOT read by default (needs the Frontdoor and a token; the consult stays cheap and offline). Flag `--clickup` reserved, not built here: DGS-428's catch-up may add it through `dg clickup get-task`. I propose to leave it out and say so |

### B. The state note: path and format
- **Path, resolved in this order:** `--note <path>` > env `DIGISMITH_CONDUCTOR_NOTE` > the entry for `<project>/<conductor>` in `<depotDir()>/conductors.json` (`{"DigiSmith/digismith-conductor": {"note": "/abs/.../note.md"}}`) > the design default `<depotDir()>/sessions/<project>/<conductor>/note.md`. For DigiSmith today the `conductors.json` entry points at `.digismith/sessions/DigiSmith/note.md`. DGS-424 migrates the note and deletes that entry. The `conductors.json` entry is created by the first use (a depot file, not in the repo).
- **The structured part** is ONE block between two HTML-comment markers, so it renders invisibly in Markdown and a tool finds it with two string searches:
```
<!-- digismith:conductor-state v1 -->
Updated: 2026-10-13T14:05+07:00
Conductor: digismith-conductor

## Running
- dgs-422 | DGS-422 | plan | since 2026-10-13T13:35+07:00
## Waiting for Jack
- <question> | since <time> | pane w2:p5
## Decided under the mandate
- <decision> | why: <reason> | allowed by: <order or standing rule>
## Parked or failed
- <what> | why: <reason> | next step: <step>
## Next
1. <step>
2. <step>
3. <step>
## Health
- Seats and usage: jack: 5h 19%, weekly 59%; dev0: 5h 12%, weekly 36%
<!-- /digismith:conductor-state -->
```
  Line formats are exactly the catch-up template's lines (design section 7 item 5), so one parser serves the state and DGS-428's catch-up. A "none" line or an empty section means empty. The block has NO Done section (computed from git) and no Open tabs line (computed from herdr).
- **The free-form rest is never touched.** `writeStateBlock(notePath, block)` replaces only the text between the markers; if there is no block it APPENDS one at the end of the file (never the top: the top is the conductor's header). Everything outside the markers stays byte-identical (tested). Two markers of the same name = error, no write. The write is atomic (temp file in the same folder, then rename) and keeps the file mode.
- Who writes: the conductor (by hand or through `state-write`); DGS-428 writes its catch-up under a different pair of markers (`digismith:catch-up`, see Alignment) in the same note.

### C. Commands (local and remote)
Run as `node --experimental-strip-types scripts/conductor/cli.ts <command>` (the Maestro's alias in the probe; no `dg`).
| Command | What |
|---|---|
| `state [--project P] [--conductor C] [--note path] [--since iso] [--json]` | collect and print the state (default: text in the catch-up template's shape; `--json`: the object above). Read-only. |
| `state-write --project P --conductor C --from <file or ->` | validate a block from a file/stdin and write it between the markers (the only write in this ticket, only to the note path). |
| `consult [--project P] [--conductor C] [--remote <ssh-target>] [--remote-repo <path>] [--machine <herdr label>] [--json]` | the Maestro's command. No `--remote`: same as `state`. With `--remote`: runs `ssh -o BatchMode=yes -o ConnectTimeout=10 <target> node --experimental-strip-types <remote-repo>/scripts/conductor/cli.ts state --json --project P --conductor C` through the injected runner (`--remote-repo` default `$HOME/Workspace/Jazurite/DigiSmith`, charset-checked), validates the JSON (`version`, keys), renders it. `--machine` adds the live pane list (`herdr --machine <label> agent list`, read-only). |
Defaults: `--project` = `DigiSmith`, `--conductor` = `<project lowercased>-conductor`.

**Read-only guard (Observer-grade).** All herdr and ssh calls go through one `Runner` (`(cmd, args, {timeoutMs}) => Promise<{code, stdout, stderr}>`) wrapped by `readOnlyRunner`, which allows only: `herdr status`, `herdr agent list|get|read`, `herdr pane list|read|get`, `herdr tab list`, `git log|rev-parse` and the one fixed `ssh ... node ... scripts/conductor/cli.ts state --json` form. Anything else throws before it runs: no `send-keys`, `prompt`, `start`, `close`, `create`. The ssh target must match `^[A-Za-z0-9._@:-]+$` and not start with `-` (herdr itself refuses a leading `-`; ssh would read it as an option). Remote needs no Claude Code on the Workbox: only Node 24 and the repo checkout (the plugin's scripts).

### D. Files (all new, under `scripts/conductor/`)
- `state-block.ts` (+ test): markers, `parseStateBlock`, `renderStateBlock`, `writeStateBlock(notePath, block, marker?)`, line parsers. **The shared parser and safe writer.**
- `state.ts` (+ test): `collectState`, note-path resolution, git/herdr/cards readers, merge and warnings.
- `runner.ts` (+ test): `Runner` type, `execRunner` (real, `execFile`, timeout, no shell) and `readOnlyRunner`.
- `consult.ts` (+ test): local and remote flow, JSON validation.
- `render.ts` (+ test): text output. **I do not render the catch-up myself:** I import `renderCatchUp` from 427's `scripts/catch-up.ts` once it merges (a local minimal stub until then) so one template exists.
- `cli.ts` (+ test): the three commands.
- `depot-stub.ts`: stub `depotDir()` until 417 merges (deleted at rebase).
- No hook, no `.claude/settings.json` or `.opencode` change, no allow rule (the commands are read-only; if Jack wants them unprompted he adds the rule: I show the line in the report, not apply it). No CLI rebuild.

### E. Tests (first, see them fail; vitest; TEMP depot via `DIGISMITH_DEPOT_DIR`; FAKE conductor note; no real SSH, no real herdr, no real git remote)
1. state-block: parses the example above; section order; "none"; malformed line = warning, not a crash; two markers = error; **write replaces only the block and leaves a free-form note byte-identical outside it**; append when absent; atomic write; file mode kept.
2. note path: flag > env > `conductors.json` > default; a missing note = `found:false` and a warning, all sections `[]`.
3. collectState with a fake note + fake runner (git log fixture, herdr status/agent list fixture): every section filled; each source failing in turn gives a partial answer + `sources` + warning; cards stub; a worker row with no card flagged.
4. read-only guard: every forbidden verb (`agent prompt`, `agent send-keys`, `pane send-keys`, `agent start`, `tab close`, `pane close`, `workspace create`) throws and the fake runner is never called; bad ssh targets (`-oProxyCommand=x`, `a b`, `;rm`) refused.
5. consult remote: fake runner returns the JSON; the exact ssh argv is asserted; a non-zero exit, a timeout, invalid JSON, a wrong `version` each give a clear error and exit 1; output equals local rendering of the same state.
6. CLI: `cli.ts` with no or a bad command prints usage and exits 1; the three commands are wired with the fake runner.

### F. First use (after merge + push; the Maestro does the live part; commands go into `probe.md`)
1. Local, from the Desktop Maestro session: `node --experimental-strip-types scripts/conductor/cli.ts state --project DigiSmith` (with the `conductors.json` entry) then `... consult --project DigiSmith`. Expect: the seven sections; Running/Waiting come from a block the conductor adds to its note (I will give the conductor the block text to paste; I do not edit the conductor's note myself).
2. Remote, once: `... consult --project DigiSmith --remote <ssh-target of the Workbox over Tailscale>` (it runs the same script there); if SSH from the Desktop session is not allowed, park the remote half with the reason in the report and in DGS-422.
3. After the Maestro confirms: ticket done with plain dates, clean up what I created.

### G. Left out, and why
- ClickUp reads in the state (needs the Frontdoor; offline-first consult; DGS-428 may add).
- Migrating the note into the depot (DGS-424).
- Seats probing by the CLI (the conductor already probes; it writes the Health line).
- Any write other than the note's block.

## Alignment
I read the 417, 418 and 427 plans (written 2026-10-13); the 428 plan does not exist yet. Where they agree with mine I say so; I changed my plan to match them (code in `scripts/`, 427's data shape, 417's names).

| # | Interface | Owner | Agreed form | Who uses it |
|---|---|---|---|---|
| 1 | `depotDir()` | 417 | `scripts/depot-dir.ts`, env `DIGISMITH_DEPOT_DIR`, default `~/.digismith-depot`. I code against it with `depot-stub.ts`, switch at rebase. **Agrees with 417 and 418.** | all |
| 2 | Note path default | 422 | `<depotDir()>/sessions/<project>/<conductor>/note.md` (**agrees with 417, 418, design section 8**). Override chain: `--note` > env `DIGISMITH_CONDUCTOR_NOTE` > `<depot>/conductors.json` entry `{"DigiSmith/digismith-conductor": {"note": "<abs path>"}}` > default. Today the DigiSmith entry points at `.digismith/sessions/DigiSmith/note.md`; DGS-424 removes it | 428, 424 |
| 3 | State block markers | 422 | `<!-- digismith:conductor-state v1 -->` ... `<!-- /digismith:conductor-state -->` inside the note | 428, conductor |
| 4 | Block headings and line formats | **427 owns names and layout; 422 owns the parser** | Running, Waiting for Jack, Decided under the mandate, Parked or failed, Next, Health (427's exact names, `none` for empty). Line formats equal 427's rendered lines: `worker \| KEY \| stage \| since T`, `question \| since T \| pane P`, `decision \| why: R \| allowed by: O`, `what \| why: R \| next step: S`, numbered Next, Health `Seats and usage:` (`jack: 5h 19%, weekly 59%; ...`). **I parse 427's rendered form back, so a 427 format change must reach me** | 427, 428 |
| 5 | State JSON | 422 | the shape in A, **field types identical to 427's `CatchUp`** (`done, running, waiting, decided, parked, next, health`, `TimeInput`, `seats: {seat, fiveHourPct, weeklyPct}[]`, `tabs: string[]`). 428 builds `CatchUp = { conductor, window, identity, askedBy, ...state }` | 428, 427 |
| 6 | Function names | 422 | `scripts/conductor/state.ts`: `collectState(opts, deps)`; `scripts/conductor/state-block.ts`: `parseStateBlock`, `renderStateBlock`, `writeStateBlock(notePath, block, marker?)` | 428 |
| 7 | CLI | 422 / 428 | mine: `scripts/conductor/cli.ts` with `state`, `state-write`, `consult`. 428's catch-up command must not take these names (proposal: its own `scripts/conductor/catch-up-cli.ts` or subcommand `catch-up`; 428 to confirm) | 428 |
| 8 | Catch-up write into the same note | 428 | its own markers `<!-- digismith:catch-up v1 -->` ... `<!-- /digismith:catch-up -->`, written with my `writeStateBlock(..., marker)` so the bytes outside the markers stay identical | 428 |
| 9 | Card reader | 417 | `listCards(project, { scope: "open" })` returning `{card, path}[]`; `newestLastSeen(project, id)` is 428's. Card field `state` = the note path | 422, 428 |
| 10 | Catch-up renderer | 427 | `renderCatchUp(data: CatchUp): string` from `scripts/catch-up.ts`; my `state` text output calls it (stub until it merges) | 422, 428 |
| 11 | Window | 428 | the state takes `--since <iso>` to filter `done`; 428 passes it | 428 |
| 12 | Times | all | ISO with offset, e.g. `2026-10-13T14:05:00+07:00`; shown UTC+7 first | all |
| 13 | 418's `## Session end` blocks appended to the note | 418 | **Safe with mine:** I only touch text between my markers; 418 appends after them or anywhere. 418 asked for confirmation: **confirmed**, and its heading is not parsed by me. One rule for 418: never write inside the `digismith:conductor-state` or `digismith:catch-up` markers | 418 |

**Disagreements noticed (for the conductor to answer; I did not pick silently):**
1. **Card file name:** 417 says `cards/<id>--<session>.yml`; 418's stub says `cards/<id>.yml` and calls `cardPath(project, id)`. I only call `listCards`, so I am not affected. 417 and 418 must settle it.
2. **`herdr --remote`:** the brief and design section 6 name it for the remote consult, but it only opens the UI (probed). My plan uses `ssh` for the state and `herdr --machine <label>` for live panes (see top). The conductor/Maestro should confirm this reading of the design.
3. **Seats text format:** 427 shows `jack: 5h 19%, weekly 59%`; my first draft used another form. I now use 427's.
4. **Conductor command naming:** 428 owns the catch-up command; I propose it does not reuse `state`/`consult`.

Still to confirm when the 428 plan exists: items 5, 7, 8, 11.

## Waiting for approved: plan

## Alignment update after the conductor's settled interfaces (approved: plan, 2026-10-13)
This replaces anything above that differs. Settled: S1 card API (417's real API; `listCards(project, {scope:"open"})` returning `{card, path}[]`; archive holds closed and lost); S4 `writeStateBlock(notePath, text, marker)` takes a parameterized marker NAME, so 428's `<!-- digismith:catch-up v1 maestro=<id> -->` / `<!-- /digismith:catch-up maestro=<id> -->` blocks (one per identity, replaced in place) work, and 418's `## Session end` text stays outside every block and is never parsed; S5 types from `scripts/catch-up.ts`; S6 code in `scripts/conductor/`, cli.ts keeps state, state-write, consult, 428 owns `catch-up-cli.ts`; S9 plain ssh with BatchMode. `state-write` errors name the line number and the expected format. The conductor copies my example block into its own note.
