# DGS-384 plan: inventory (checkpoint 1, no edits yet)

Searched: skills/, hooks/, .digismith/hooks/, scripts/, packages/, profiles/, docs/, README.md, MEMORY.md, .opencode/, .claude/, ~/.digismith-depot, ~/.claude/settings.json.
Not searched for change: `.digismith/board/`, `.digismith/docs/`, `backlog/`, `history.html` (records, part 4 or part 3).
There is no CLAUDE.md in the repo. `sync.py` has NO caller in tracked code or in hooks, skills or settings: it is only named in untracked session notes and the d3 brief.

## A. Places that WRITE or CREATE backlog files (the process rule)
| # | File | Today | Planned change |
|---|---|---|---|
| 1 | `.opencode/skills/clickup-rules/SKILL.md` (l.3, l.8) | "A new backlog item (`backlog/<name>.md`) gets its ClickUp task in the same step, key written back into the file" (DGS-163 mirror rule) | Rewrite: an idea becomes a ClickUp ticket through `dg clickup create-task` (priority Normal), no file; retire the mirror rule |
| 2 | `.opencode/prompts/maestro.md` (l.20) | Same DGS-163 rule: new backlog item gets its ClickUp task | Same rewrite |
| 3 | `.digismith/sessions/workbox.md` (l.78, 134, 363; git-excluded) | Points at `backlog/<file>.md` items | Disk edit only: point at the ClickUp key. Never commit |
| 4 | `.digismith/sessions/d3-maestro/brief.md` l.25, `DigiSmith/note.md` l.109 (git-excluded) | DGS-163 auto-create rule text | Disk edit, same rewrite, if Jack wants; otherwise list only |

## B. Places that READ backlog files (pointers)
| # | File | Today | Planned change |
|---|---|---|---|
| 5 | `docs/getting-started.md` l.106 | Links `backlog/README.md` as the stage index | Point to the ClickUp F clan lists / Imperium |
| 6 | `skills/brainstorming/SKILL.md` l.83 | "See `backlog/toolchain-general-trigger-scope.md`" | Cite the ClickUp ticket key (looked up with `dg clickup`) |
| 7 | `skills/toolchain/SKILL.md` l.104 | Same file | Same |
| 8 | `skills/adopt/SKILL.md` l.11 | Names `backlog/mid-development-workflow-injection.md` (retired) | Cite the ticket key |
| 9 | `skills/depot/SKILL.md` l.304 | Mentions a backlog file in a troubleshooting row | Cite the ticket key |
| 10 | `skills/subagent-driven-development/SKILL.md` l.239 | `backlog/tokenreply-kimi-k3-tool-calling-failure.md` | Cite the ticket key |
| 11 | `skills/offload-implementer/SKILL.md` l.419 | Same file | Same |
| 12 | `.digismith/hooks/post-finish/02-plugin-reinstall.md` l.33 | `backlog/auto-update-plugin-after-merge.md` | Cite the ticket key |
| 13 | `packages/cli/src/tokens/README.md` l.15 | Backlog pointer | Cite the ticket key |
| 14 | `scripts/providers/tokenreply.ts` l.14, `scripts/runners/types.ts` l.11, `scripts/token-counter/tokenreply-pricing.ts` l.5 | Code comments naming backlog files | Comment-only edit to the ticket key (no behaviour; no test needed) |
| 15 | `.opencode/probes/run_pilot.py`, `.opencode/safety/compare-reviewers.mjs`, `.opencode/safety/test-rules.mjs` | Test fixtures using `backlog/` paths as sample text | Leave: fixtures, not the process. Confirm with maestro |

Ticket keys for 6-14 come from `dg clickup` search (the files record their key in the status line); I will not guess them.

## C. sync.py
- No caller found in repo, skills, hooks, `hooks/hooks.json`, `.claude/` or `~/.claude/settings.json`. Only prose mentions in untracked session notes (`note.md.before-mac-handoff-2026-10-06`, `order-dgs-164-board-move.md`, d3 note). Nothing to unhook in tracked code.
- Planned: confirm again after edits with a grep; list `~/.digismith-depot/backlog-sync/sync.py` for Jack (kept, not deleted).

## D. Left alone (records)
`MEMORY.md` letter map rows (l.244-261) and `.digismith/history.html` (part 4); `backlog/*`; `.digismith/board/**`, `.digismith/docs/**`, old session notes.

## E. Master's memory lines that mention backlog (report only, not edited)
MEMORY.md index lines 29 (auto-create ClickUp task for each backlog item, already marked SUPERSEDED), 42 (tool gap: check backlog), 53 (ClickUp is the only tracker, current). Line 6, 15 are false hits. The lines still saying the "backlog file" is not the Master's to edit: none found in the index; the topic files were not opened.
