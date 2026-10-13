# DGS-411 plan: Maestro identity

## Decision: how a Desktop session learns it IS a Maestro
Option A (recommended): the identity record carries the project `folder`. The plugin's SessionStart hook (already registered for every session) writes the card from the record when ALL are true: no valid `DIGISMITH_ROLE`/`DIGISMITH_PROJECT` env, no `HERDR_PANE_ID` (not inside herdr), and the main root of the session's cwd (worktrees resolve to it) equals exactly one record's `folder`. Herdr sessions keep env from boot script/briefs (env always wins). Several matches = no card + stderr note (never guess).
Option B (rejected): `env` block in `.claude/settings.json`. It cannot say "not in herdr", so the conductor and every worker started in the folder would also become Maestros.
Option C (rejected): a mapping in the repo's `.digismith/config.yml`. Folder paths are per machine; live data stays out of the repo.

**Settings diff: none.** No `.claude/settings.json`, `hooks/hooks.json` or config edit; the mapping is the depot record, written by a CLI command. No classifier risk.

## How a session learns who it is, its session id, conductor and project
The SessionStart hook prints one context line: identity id, name, project, session id, conductor id, and the other open sessions of the identity (the registry, "who else is open"). Several live sessions each learn their own session id this way. Skill `catch-up` step 1 reads that line (env or card stay as fallback). The idle handler's conductor comes from the record's `conductors[0]`, else the old `<project>-conductor` rule.

## Identity record `~/.digismith-depot/identities/<id>.yml`
id (stable slug, = file name), name, owner, project, folder (absolute), conductors (list), role (maestro), created. No secrets (looksSecret check), single-line values, no unknown fields.

## Tasks (TDD, pnpm)
1. `scripts/identity.ts`: type, format/parse, validate, read/list/write (atomic), `findByFolder`, `cardFromIdentity`.
2. `scripts/identity-cli.ts`: `write <file>`, `list`, `show <id>`, `resolve --cwd <dir>`.
3. `card-hook.ts` start: identity branch; returns the context line; `hook-cli.ts` prints it for `start`.
4. `idle-check.ts` conductorFor from the record.
5. `skills/catch-up/SKILL.md` step 1 update.
6. Whole-branch Claude review, merge with hooks 01-03, report.md + report.html + plan.md, push, `probe.md`.

## Out of scope
The real DigiSmith record is live depot data, written at first use by the CLI (not in the repo). OpenCode Maestros: later.
