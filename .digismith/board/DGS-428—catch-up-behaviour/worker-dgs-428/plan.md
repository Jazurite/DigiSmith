# DGS-428 plan: catch-up behaviour (intent, conductor command, idle trigger, note write)

Worker `dgs-428`, 2026-10-13. Spec: design.md section 7 (DGS-404). Epic DGS-402. Depends on DGS-422 (state and note), DGS-427 (template and data shape), DGS-417 (cards, identity API, `depotDir()`). I merge LAST.

## The change in one paragraph
A new CLI command `digismith role catch-up` (also `dg role catch-up`) builds a catch-up for one conductor and one Maestro identity. It computes the window, reads the conductor state, the cards of its domain, `git log origin/main` and ClickUp, hands one data object to DGS-427's renderer, writes the result into the conductor's `note.md`, and prints it. Two triggers call it: (1) a skill whose description names the intent "I want to catch up", (2) a plugin `UserPromptSubmit` hook that fires when the session is idle. Front-end view: the skill is the click handler's matcher, the command is the `fetch()` to the backend, the template is the JSON-to-HTML render.

## 1. Intent recognition (no phrase, no keyword list)
- **Claude Code Desktop and CLI:** a new plugin skill `skills/catch-up/SKILL.md`. Skill selection is done by the model reading the `description`, so the intent is matched by meaning, not by words. Draft text:
  ```
  ---
  name: catch-up
  description: Use when Jack, in a Maestro session, wants to be brought up to date on what happened while he was away, in any words ("catch me up", "how is it going?", "what is the update?", "status?", "what did I miss?"). Not for a status question that sits inside another task ("merge it and tell me the status of DGS-12"). Runs the conductor's catch-up command and answers with its output unchanged.
  ---
  # Catch-up
  1. Read your card (role maestro, id, domain, its conductor). Not a Maestro: stop.
  2. Run: digismith role catch-up --maestro <your id> --session <your session id> --conductor <conductor id>
  3. Answer with the output exactly as printed (section order is fixed). Do not summarise or reorder.
  4. Exit code 3 = the conductor's state is missing: say so in one line and offer to read the conductor's pane (DGS-422 consult flow).
  ```
- **OpenCode app:** it does not read plugin hooks. Two layers, both text only: (a) the same text as a prompt rule in the Maestro boot prompt (the role-card boot text DGS-417/418 write into the session context: one line "If Jack wants to catch up, in any words, run `digismith role catch-up ...` and answer with it unchanged"); (b) the OpenCode skill folder if the app loads `skills/` (to verify in the probe, not assumed). I do NOT touch `.opencode/**` (denied to OpenCode agents; Jack's call).
- No keyword list, no regex anywhere in the code. The command itself never classifies a message.

## 2. The command
`digismith role catch-up --conductor <id> --maestro <maestro id> --session <asking session id> [--project <name>] [--now <iso>] [--refresh] [--no-write] [--json]`
- New group `packages/cli/src/role/` (`index.ts`, `catch-up.ts`, `catch-up.test.ts`), registered in `packages/cli/src/index.ts`. Pure core in `catch-up.ts` with injected readers so tests use no network, no git, no real depot.
- Steps: window -> reuse check -> collect -> render -> write note -> print.
- **Window** `computeWindow(cards, maestroId, askingSession, now)`: `from` = newest `last_seen` among cards with `id == maestro id` (open, closed, lost) EXCLUDING the asking session's own card (its heartbeat is "now" and would make the window empty; design says "all its session cards", this is the only reading that works; flagged in Alignment). No card at all: `from = now - 24h`. `to = now`. First output line names it in UTC+7.
- **Collect** (all read-only):
  - state: DGS-422's reader `readConductorState(conductorId)` (roster, waiting questions, decision log, next steps).
  - cards: DGS-417's `listCards(project)` filtered to `domain == project`: who is open/closed/lost since `from`.
  - git: `git log origin/main --since=<from> --format=...` in the repo root (merged tickets: KEY from the subject/`DGS-nnn`, report link from `.digismith/board/<KEY>*/worker-*/report.html` if present). No `git fetch` here; the command prints a warning line in Health if `origin/main` is older than the window start (a fetch is a write to refs, kept for the caller).
  - ClickUp: ticket status and new comments since `from` for each key in the state roster and the git log, through `dg clickup get-task` (the client the command already wraps, injected in tests). One ClickUp failure shows as "ClickUp unreachable" under Health; the rest still renders.
  - Health: seats and usage from the usage probe file if DGS-422's state carries it, else "unknown"; herdr state and open tabs from the state note (the command never touches herdr).
- **Domain only:** every reader is given the conductor's domain; cards/state/git entries outside it are dropped (a test proves a foreign card never appears).
- **Render:** DGS-427's `renderCatchUp(data)`; fixed order, "none" for an empty section. I never format sections myself.
- **Write:** `appendCatchUp(notePath, window, maestroId, askingSession, text)` appends a block to `<depot>/sessions/<project>/<conductor>/note.md` under a heading `## Catch-up <from> to <to> (UTC+7) | maestro <id> | asked by <session>` followed by the rendered text. Atomic: write temp file in the same folder, rename. The conductor owns the note; the command writes ONLY that one append (and creates the file if DGS-422 says it may be absent).
- **Reuse (the "does not ask again" rule):** before collecting, find the newest catch-up block for this maestro id in the note. If its `to` is later than the computed `from` AND it is not older than `--max-age` (default 30 min), print that block as is (first line says "from note, written <time>"), and exit 0 without collecting. `--refresh` skips this. Open point for the Conductor, see Alignment (4).
- Exit codes: 0 ok, 2 bad args, 3 state note/conductor missing (nothing written), 4 write failed (catch-up still printed).
- Times: UTC+7 first; UTC in brackets only for a time that came from a tool (git `%cI` converted: shown "13:30 (06:30 UTC)").

## 3. Idle trigger (second trigger)
- **Where:** the plugin's own `hooks/hooks.json`, a new `UserPromptSubmit` entry. This is plugin config, NOT `.claude/settings.json` and not the OpenCode config, so no settings edit. (Per the common rules I still show the exact diff here; Jack/Conductor to say if plugin hooks.json counts as "settings" and needs a park.)
- **Exact diff:**
  ```diff
  --- a/hooks/hooks.json
  +++ b/hooks/hooks.json
  @@
           ]
         }
  +    ],
  +    "UserPromptSubmit": [
  +      {
  +        "hooks": [
  +          {
  +            "type": "command",
  +            "command": "node --experimental-strip-types \"${CLAUDE_PLUGIN_ROOT}/scripts/catchup-idle-hook.ts\""
  +          }
  +        ]
  +      }
       ]
     }
   }
  ```
  (SessionStart's closing `]` gets the comma; DGS-418 also edits this file for its SessionStart/End hooks: merge conflict expected and trivial; I merge last and rebase.)
- **Script** `scripts/catchup-idle-hook.ts` (reads the hook JSON on stdin, `session_id`): finds its own card via DGS-417 `findCardBySession(sessionId)`. Silent no-op (exit 0, no output) unless: card exists, `role == maestro`, `status == open`, and its `last_seen < newest last_seen among cards of the same id` (excluding itself). Then it prints `additionalContext`: "This Maestro session is idle against its identity. Before answering Jack's message, run `digismith role catch-up ...` and give its output first, then answer." It never runs the command itself (a hook must stay fast and read-only, and the model needs the output). Must finish in < 200 ms; any error = silent exit 0 (never block Jack's prompt).
- It does not refresh `last_seen` (DGS-418's heartbeat does; otherwise idle would never clear). Alignment (3).
- **OpenCode:** the equivalent is a plugin `chat.message` event in the OpenCode config: parked, a ticket-worthy follow-up; prompt rule (1b) covers it by text meanwhile. I do not edit `.opencode/**`.

## 4. Files
New: `packages/cli/src/role/{index,catch-up,catch-up.test}.ts`, `skills/catch-up/SKILL.md`, `scripts/catchup-idle-hook.ts` + `.test.ts`, `scripts/catchup-window.ts` + test (shared by command and hook), `scripts/stubs/` none (stubs live inside the modules marked `// STUB until DGS-nnn merges`).
Changed: `packages/cli/src/index.ts` (register `role`), `hooks/hooks.json` (diff above), `packages/cli/src/index.test.ts` if it lists commands. Plus plan/report/report.html in the board folder.

## 5. Tests (TDD, vitest, temp depot via `DIGISMITH_DEPOT_DIR`, no network)
1. window: newest `last_seen` across open/closed/lost; own card excluded; none -> 24h; first line text in UTC+7.
2. domain filter: foreign-domain card, foreign git ticket and foreign state entry never appear.
3. render call gets the DGS-427 data object; empty sections give "none" (via the renderer).
4. note write: appended block with window heading; atomic; existing content untouched; missing note -> exit 3, nothing written.
5. reuse: fresh block reused (no collect call); `--refresh` collects; stale block (older than max-age) collects; other maestro's block ignored.
6. ClickUp failure degrades to a Health line; git failure likewise.
7. idle hook: not a Maestro / no card / open and current / idle -> context printed; error paths silent; never reads or prints a token.
8. skill file lint: description names the intent, contains no keyword list marker (frontmatter parses).
9. CLI e2e: `role catch-up --help` listed (FORCE_COLOR=1).

## 6. First use (Maestro/Jack does the live part; steps go into `probe.md`)
1. In a Maestro session (card role maestro, conductor `digismith-conductor`): type "how's it going?". Expect the catch-up in the template's order, first line with the window.
2. Check the conductor note in the depot has a new `## Catch-up ...` block.
3. Open a second Maestro session of the same identity; type "what did I miss?": expect the note's block, no new collect.
4. Idle trigger: leave session A idle, work in B, type anything in A: expect the catch-up before the answer.
5. Cleanup: I remove only the test block I wrote? NO: that is a delete in a shared note; I leave it and ask Jack.

## 7. Left out, and why
- OpenCode idle hook (config edit denied; ticket proposed).
- Writing a card heartbeat (DGS-418).
- Any herdr call (DGS-422's consult flow owns the pane read).
- Fetching origin (kept out of a read command).

## Alignment (names I code against; pinned until the other plans exist)
The other four plans do not exist yet (read 13:4x UTC+7). I will fill the final names after reading them. Proposed, to be confirmed:
| Interface | Owner | Name I assume | Notes |
|---|---|---|---|
| Depot root | DGS-417 | `depotDir()`; env `DIGISMITH_DEPOT_DIR`, default `~/.digismith-depot` | local stub until merge |
| Cards read | DGS-417 | `listCards(project): Card[]`, `findCardBySession(sessionId): Card \| undefined`; Card fields as design section 5 (`id`, `role`, `session`, `domain`, `last_seen` ISO with offset, `status`) | `last_seen` parsed with the offset |
| Identity | DGS-417 | `maestro id` = the card `id` of the Maestro | |
| Conductor state | DGS-422 | `readConductorState(conductorId): ConductorState` and note path `<depot>/sessions/<project>/<conductor>/note.md` | need: roster, waiting, decisions, next, usage if any |
| Template | DGS-427 | `renderCatchUp(data: CatchUpData): string`, data = {conductor, window{from,to}, maestroId, askedBy, done[], running[], waiting[], decided[], parked[], next[], health{...}} | I fill it, never format sections |
| Hook file | DGS-418 | `hooks/hooks.json` edited by both of us | I rebase after 418 |
| Card heartbeat | DGS-418 | refreshes `last_seen` on prompts | needed so idle clears |

Questions for the Conductor / disagreements to settle (I do not pick silently):
1. Window reading: design says newest `last_seen` across all cards; I exclude the asking session's own card (else the window is empty). OK?
2. DGS-422 note format: does the note have a reserved place for catch-up blocks, or may I append `## Catch-up ...` at the end? Who else writes the note at the same time (the conductor)? I propose an append with a temp+rename, last writer wins; 422 to confirm a lock or an append-only rule.
3. DGS-418 heartbeat: if `last_seen` refreshes on every prompt, idle clears after my hook runs? Hook reads the card BEFORE 418's heartbeat refreshes it, so order of hooks in `hooks.json` matters: mine first.
4. Reuse rule (30 min max-age and `to` later than window start) is my proposal; the design only says "does not ask again".
5. Does the CLI group name `role` clash with anything in DGS-422's consult command? 422 should say its own command name.

Waiting for approved: plan.


---
# REVISION 2 (after "approved: plan" and the conductor's settled interfaces S1-S12, 2026-10-13). THIS REPLACES everything above that differs.

## What changed against the first plan
| Was | Now | Why |
|---|---|---|
| `digismith role catch-up` in `packages/cli/src/role/`, registered in the CLI | `scripts/conductor/catch-up-cli.ts` (plain TS, `node --experimental-strip-types`), core `scripts/conductor/catch-up.ts`, window `scripts/conductor/catch-up-window.ts`. No `packages/cli` change, no CLI rebuild, no `dg` registration | S6 |
| my `hooks/hooks.json` UserPromptSubmit entry | NO hooks.json edit. I write `scripts/conductor/idle-check.ts` (handler) and, at my merge, add it to 418's pre-prompt handler list in its `hook-cli.ts` (a code edit in 418's merged file), so it reads the card BEFORE the heartbeat | S7 |
| `readConductorState`, `CatchUpData`, `maestroId` | 422's `collectState`; 427's `CatchUp`, `identity`, `askedBy`; `renderCatchUp(data: CatchUp)` from `scripts/catch-up.ts`; `CatchUp = {conductor, window, identity, askedBy, ...state}` | S5 |
| per-catch-up `## Catch-up` headings appended | ONE block per identity written with 422's `writeStateBlock(notePath, text, marker)` between `<!-- digismith:catch-up v1 maestro=<id> -->` and `<!-- /digismith:catch-up maestro=<id> -->`, REPLACED in place; no history in the note | S4 |
| card API guessed | 417's real API: `listCards(project,{scope})` -> `{card,path}[]`, `findCardBySession(session, project?)`, `newestLastSeen`, `nowIso`, `depotDir()` in `scripts/depot-dir.ts` | S1 |
| ClickUp by key | key -> task id first (S12): look in the board folder `.digismith/board/<KEY>*/` for the task id; cannot resolve = soft "ClickUp: <KEY> unresolved" line in Health, never a throw | S12 |
| OpenCode parts | TEXT ONLY, in the report and probe (prompt-rule text, idle-hook idea); no `.opencode` edit; follow-up DGS-430 | S10 |
| first use | starts from a Maestro card the Maestro writes by hand with 417's CLI (S11); exact steps in `probe.md` | S11 |

## Window and idle (S8, unchanged in substance)
`from` = newest `last_seen` over cards of the identity (open, closed, lost) EXCLUDING the asking session's card; none = now minus 24 h; `to` = now. Idle = the asking session's own card `last_seen` older than the newest `last_seen` among the identity's OTHER cards. Reuse: a block of the same identity whose written time is within 30 min (`--max-age-min`) is printed as is; `--refresh` collects again.

## Block content and reuse mechanics
Inside my block: a first line `Written: <ISO with offset>`, then the rendered catch-up text. The reuse check parses `Written:` from the block for my identity only.

## Alignment (final names; checked against the 417, 418, 422, 427 plans)
| Interface | Owner | I use | Status |
|---|---|---|---|
| `depotDir()` | 417 | `scripts/depot-dir.ts`, env `DIGISMITH_DEPOT_DIR` | local stub `scripts/conductor/deps-stub.ts` until 417 merges |
| Cards | 417 | `listCards(project,{scope:"all"})`, `findCardBySession(session, project?)`, `nowIso`; fields incl. optional `ended`, `result` | stub then import at rebase |
| State | 422 | `collectState(opts, deps)` from `scripts/conductor/state.ts` (opts incl. `since`); returns CatchUp fields minus conductor/window/identity/askedBy, plus `warnings`, `sources` | stub |
| Note path | 422 | its resolver (flag > env `DIGISMITH_CONDUCTOR_NOTE` > `conductors.json` > default `<depot>/sessions/<project>/<conductor>/note.md`); I call it, I do not copy it | stub: the same chain, small |
| Block writer | 422 | `writeStateBlock(notePath, text, marker)`, `parseStateBlock` style parser for markers | stub with the same contract (replace between markers, append at END if absent, atomic) |
| Template | 427 | `CatchUp`, `TimeInput`, `renderCatchUp` from `scripts/catch-up.ts` | stub renders minimal |
| Hook list | 418 | `hook-cli.ts prompt` pre-prompt handler list; my handler `idleCheck(event, deps)` returns context text or undefined | at my merge |
| My names | 428 | `scripts/conductor/catch-up-cli.ts` (`--conductor --maestro --session --project --refresh --no-write --max-age-min --now --json`), `catch-up.ts`: `buildCatchUp`, `catch-up-window.ts`: `computeWindow`, `isIdle`; `idle-check.ts`: `idleCheck` | |
| Times | all | ISO with offset; UTC+7 first | |
Disagreements left: none new. 418's `## Session end` text sits outside every marker block (S4), so it never touches mine.

## Unresolved by me, said plainly
- Conductor-note marker and 422's `writeStateBlock` signature: if 422 merges a different one I adapt at rebase.
- OpenCode text (for report/probe only): prompt rule: "If Jack wants to catch up, in any words, run `node --experimental-strip-types scripts/conductor/catch-up-cli.ts --maestro <id> --session <session> --conductor <id>` and answer with the output unchanged." Idle idea: an OpenCode plugin `chat.message` event doing the same check as `idle-check.ts`: DGS-430.


# Merge-time notes (2026-10-13)
Stubs replaced by the real 417, 422 and 427 modules; `writeStateBlock(notePath, body, Marker)` adopted; `idleHandler` registered in `PRE_PROMPT_HANDLERS`; `--note` added for scratch runs; `conductorFor` = `<domain lowercased>-conductor` or `DIGISMITH_CONDUCTOR`.
