# DGS-191 + DGS-403: apply the new role names (text only) — plan (checkpoint 1)

Worker `dgs-191`, seat dev0. Written 2026-10-11 ~22:2x UTC+7. Read only so far: nothing changed outside this folder.
Epic DGS-402 (`14zcebrvdug`), DGS-191 (`14zcebrv43b`), DGS-403 (`14zcebrvduh`), DGS-405 (`14zcebrvduk`) read. All sit in list B.5 Roles `1301150000002911` (DGS-405 too).

## Word rules
| Old word, used as a role | New word |
|---|---|
| "Master" (Jack's directing Desktop/OpenCode-app session) | "Maestro" |
| "maestro" (the herdr head butler, tab 1) | "conductor" (capital at sentence start) |
| "the Masters (Desktop sessions)" | "the Maestros" |
| "the Desktop maestro" (an old Desktop session that drove the project) | "the Maestro" (a session outside herdr) |

Kept as written: agent names (`digismith-maestro`, `d3-maestro`, `emma-maestro`, `soveron-maestro`, `b3-maestro`, `opencode-maestro`), file and path names (`master-note.md`, `master-check.md`, `brief-draft-maestro.md`, `.digismith/sessions/<name>/note.md`, `worker-maestro-conventions/`), the OpenCode agent ids `maestro` and `maestro-review`, the config key `maestro:` (config-parse tests), `Role = "maestro"` in `packages/cli/src/tokens/*` (an identifier in token data), and the literal title example `"K: Maestro"` (a lineage-key test string). Sentence naming both: "the conductor (`digismith-maestro`)". "master"/"main/master branch", "ClickUp is the master copy" and `nvm-sh/nvm/master` are not roles: untouched.
Historical text is not rewritten: board reports, plans, designs, `.md/.html` of merged tickets, `.digismith/docs/**`, `.digismith/history.html`, ClickUp comments.

## Files I will change (repo, tracked)
Hits are a case-insensitive count of "master|maestro" in the file.
| File | Hits | Change | Not changed |
|---|---|---|---|
| `skills/handoff/SKILL.md` | 5 | l.11 "maestro session" -> "conductor or Maestro session" (both keep a note.md); l.47 and l.102 "a worker the maestro started" -> "the conductor started" | l.16, l.80 `K: Maestro` (literal test title) |
| `skills/bootstrap/SKILL.md` | 1 | l.268 "a maestro's brief" -> "a conductor's brief" | |
| `skills/finishing-a-development-branch/SKILL.md` | 2 | l.420 "The maestro closes the worker" -> "The conductor closes the worker"; l.422 "the maestro's `.../note.md`" -> "the conductor's or Maestro's" | |
| `.digismith/hooks/post-finish/02-plugin-reinstall.md` | 3 (l.41-46, one block) | "the Desktop maestro" / "the maestro" -> "the Maestro" (a Desktop session outside herdr) | |
| `scripts/session-path.ts` | 3 | l.67 comment "i.e. maestro sessions" -> "i.e. conductor and Maestro sessions"; comment only, no code | l.2 and l.21 (a doc path and the `K: Maestro` title) |
| new `scripts/role-words.test.ts` | | TDD guard, see Tests | |
No hit in `skills/init`, `executing-plans`, `subagent-driven-development` (only "main/master branch"): no change.
The plugin skills have few role hits: five files, 11 hits in all, 7 of them changed.

## Left out, I need your call (Maestro)
1. `.opencode/` (repo): `prompts/maestro.md`, `skills/{clickup-rules,dispatch-worker,flux,handoff}/SKILL.md`, `maestro/opencode.json`, `safety/*` (about 55 hits). These name the role ("You are the DigiSmith maestro", "Orders from the Master") and DGS-401 is changing the OpenCode prompts now. I propose I leave them to dgs-401 (no shared-file conflict). Say if you want them in this change.
2. `.digismith/docs/**` (28 files), `MEMORY.md` l.188 (a path): historical or a path, untouched.
3. `packages/cli/src/clickup/update-field.test.ts` ("Maestro" is a sample option name): untouched.

## Runbook `.digismith/sessions/workbox.md` (untracked, git-excluded; edit on disk, never commit or `git add`)
- Add a "## Roles" section at the TOP (after the h1 and the one-line intro) with the table of the new words (master, Maestro, Conductor, Worker, Scout, Reviewer, Observer, Representative) and the identifier note (agent names stay until DGS-405).
- 84 hits in all. In the current-setup part (l.1-56) and the standing rule (l.88-97) and the live sections that describe how things work today (l.99-482, "Flux protocol", "Merge order", "Start of a ticket", "Reading usage", the account rules): "maestro" as role -> "conductor"; "Desktop maestro" and "Master" -> "Maestro". Identifier lines (`digismith-maestro`, `b3-maestro`, `ensure_maestro`, `b0-maestro`) stay; "owner: maestro" -> "owner: conductor" except where the text says the Desktop session clears itself ("Maestro flux", M1-M6, the kicker): that one is the Maestro flux (the Desktop session), so it keeps "Maestro" and the section header stays "Maestro flux" (it is already right under the new meaning).
- NOT rewritten: the dated quotes of Jack and test results (e.g. l.302 "The maestro keeps its seat: a Desktop session on dev0", l.451-456 kicker test log): I add nothing there; l.302 is decided by Jack 2026-10-03 and the kicker log is a historical record. The Hetzner-era part (l.57-87 and l.483 onward: macOS, status, attach, lineage sessions, resume) only gets role words if they are in a "how it works now" sentence; I will list each such change in the report.
- l.53 "DGS-191 (rename Maestro to Conductor, later)" -> reworded: done by DGS-191.

## ClickUp (through `dg clickup update-task`; flags checked in `--help` before the write; each read in full first, written back with only the added line)
| Ticket | id | New name |
|---|---|---|
| DGS-170 | `14zcebruqtk` (done) | "Define the Maestro role (Jack's representative session)" |
| DGS-176 | `14zcebruqu3` | "Define the Conductor role: the project's head butler" |
| DGS-145 | `14zcebrupea` | "Conductor handoff: save and restore the conductor's working state" |
| DGS-139 | `14zcebrunum` | **your call.** Name today: "Maestro role: one Desktop session supervises herdr workers". Under the new words that sentence describes the Maestro (a session outside herdr), so the name may be right as is. Default: name unchanged, description line only. |
Each description gets ONE added line: "Renamed 2026-10-11 (epic DGS-402)" (for DGS-139: "Role words reviewed 2026-10-11 (epic DGS-402), name kept" only if you confirm it stays). I read name and description back after each write and report cosmetic markdown differences. No other ClickUp write except closing DGS-191 and DGS-403 (done, dates 2026-10-11).

## Tests (TDD)
New `scripts/role-words.test.ts` (vitest, same style as `scripts/session-path.test.ts`). It reads every `skills/**/*.md` and fails on: "Master" as a word (excluding "main/master branch" lines) and on a lowercase role use of "maestro" that is not in the allow-list (backticked identifiers, `K: Maestro`). I write it first, see it fail on the 7 hits, then fix the text until it passes. No other code changes, so existing tests stay as they are. Checks I run: `FORCE_COLOR=1 pnpm test`, `pnpm --filter @digismith/cli build`, the vendored-skills and attribution checks and any `check_*` script I find (I list them in the report).

## First-use read-back
After the merge and push: `dg clickup get-task <id>` for the 3 (or 4) renamed tickets (name and description, plus the end of the description for the one dated line), then DGS-191 and DGS-403 `done` with both dates `1791666000000`, read back.

## Merge notes
Branch `dgs-191` in `.worktrees/dgs-191` from origin/main (now `c80064f`). dgs-401 is in parallel; I share no file with it (I left `.opencode/` out). Whoever is ready first merges; the other rebases. Hooks 01-03, CLI rebuild, push. plan.md, report.md, report.html committed together by named paths. Jack's staged `backlog/` removal stays untouched in the main checkout.

Waiting for approved: plan
