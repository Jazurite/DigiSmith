You are reviewing a finished feature branch. You are read-only.

Repository: this directory is the DigiSmith main checkout. The branch under review is `dgs-214`, checked out in the
worktree `.worktrees/dgs-214/` inside this directory. Read the branch's files there directly.
Base commit: `db7ab79`. Review the whole change: `git log db7ab79..dgs-214` and `git diff db7ab79..dgs-214`.

What the branch builds (ticket DGS-214, slice 1 of 2): a token counter. Counts only, never prices.
- `packages/cli/src/tokens/types.ts`: `UsageRecord`, `Counts`, registry entry and snapshot types, step names.
- `packages/cli/src/tokens/claude-code-reader.ts`: reads one Claude Code transcript (`~/.claude/projects/<project>/<session>.jsonl`)
  and its subagent files (`<session>/subagents/agent-*.jsonl`) into deduped usage records. Dedupe key: `message.id` + `requestId`
  (one API response appears on several lines). Cache writes split into 5-minute and 1-hour from `usage.cache_creation`.
  Resumed sessions replay earlier lines; each replayed response must be credited once, to its own session.
- `packages/cli/src/tokens/registry.ts`: an append and read interface, with an interim depot default
  (`~/.digismith-depot/token-registry/<ticket>.jsonl`, env override for tests).
- `packages/cli/src/tokens/attribution.ts`: finds a transcript by session id, and tags sessions to a ticket when no registry line
  exists: by the transcript's `custom-title` lines, or any `gitBranch` or `cwd` line in the head that names the key
  (case-insensitive, followed by `__`, `-` or the end; `dgs-2140` must not match `DGS-214`). The last commit, `20f0476`, fixed
  this tagging and had no separate re-review: look at it closely.
- `packages/cli/src/tokens/snapshot.ts` and the `dg tokens <ticket>` command (`packages/cli/src/tokens/index.ts`, registered in
  `packages/cli/src/index.ts`): group records into steps, tasks and sessions, print a table, `--json`, `--write` a versioned
  `tokens.json` (board folder in DigiSmith's own repo, the depot in any other repo).
- `packages/cli/src/tokens/README.md`.

The spec is the approved design: `.digismith/board/DGS-214—count-tokens-per-ticket/design.html` (in this directory). The plan is
`plan.md` in the same folder (slice 1 = Tasks 1 to 6). Where code and design disagree, the design wins.

Check, in this order:

1. Correctness bugs: wrong counts, double counting or lost responses, crashes on real transcripts (malformed lines, missing
   fields, very large files), wrong ticket tagging (false matches and misses), wrong snapshot path, registry lines that can be
   torn or interleaved. Look hardest at the dedupe rule (which line wins when lines with the same key differ), the resumed-session
   replay rule, subagent files, the cache split fallback, the tagging regex, and the `tokens.json` path choice.
2. Places where the code disagrees with the design, especially: counts only (no prices or dollars anywhere), no message text
   read into output or stored, library files import only `node:` built-ins and sibling `.ts` files, the registry used only
   through its interface.
3. Test gaps: a design rule with no test; a test that can pass while the code is wrong (fixtures built from a wrong assumption
   about the real transcript format already happened once on this branch); a test that touches real files under `~/.claude`
   or `~/.digismith-depot` instead of a temporary folder.
4. These minor findings deferred during the build (details in `.worktrees/dgs-214/.sdd-workspace/progress.md`). Say for each
   whether it is real and how severe:
   - registry timestamps in mixed formats (with and without milliseconds) compare wrongly within one second
   - a torn registry line glues onto the next append
   - the subagent `agent_id` falls back to the file name

Rules:
- Do not edit any file. Do not run builds or tests. Use only `git show`, `git diff`, `git log`, `git grep` and `git status`,
  and read files directly. Do not read anything under `~/.claude` or `~/.digismith-depot`, and no `.env` file.
- Report only findings you verified in the code.
- For each finding give: severity (critical, important or minor), `file:line`, what is wrong, a concrete input or scenario that
  shows it, and the fix.
- End with one verdict on its own line: ready to merge, ready after fixes, or not ready.
