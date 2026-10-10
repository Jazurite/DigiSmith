# DGS-214 slice 2, step 1: where a skill gets the live session id (checkpoint A)

2026-10-10 ~18:1x UTC+7 [11:1xZ]. Worker `dgs-214`. Order: `order-slice-2-session-id.md`.

## The problem
Slice 2 skills (`init`, the step skills, SDD, `finishing`) call `entry.ts session|step-start|step-end` and need the session id of the Claude Code
session that runs them. The plan's rule was "the newest transcript in the cwd folder". It fails here: the maestros and the workers all start in the
repo root, so several live sessions share one project folder.

## Choice
**Use `CLAUDE_CODE_SESSION_ID`, the environment variable Claude Code sets in every Bash command.** No SessionStart hook, no herdr call.

`entry.ts` resolves the id in this order: the `--session-id` flag, then `CLAUDE_CODE_SESSION_ID`. Both must match `^[A-Za-z0-9_-]+$`. Nothing else
is tried. If neither gives an id, it warns on stderr, writes nothing and exits 0 (the ticket flow never stops). If the id has no transcript file, it
still writes the entry and warns.

## What I tested (counts and ids only, no message text)
Claude Code 2.1.296. The documentation (code.claude.com, environment variables page) says: `CLAUDE_CODE_SESSION_ID` is "set automatically to the
current session ID in Bash and PowerShell tool subprocesses, hook command subprocesses, and stdio MCP server subprocesses", "matches the `session_id`
field in the hook JSON input and is updated on `/clear`". It adds that on `--continue` or `--resume` without an explicit id it "may receive the initial
startup ID instead". The tests check the real behavior, because of that last sentence.

| # | Case | Env value | Transcript | Result |
|---|---|---|---|---|
| 1 | This worker session, Bash | `2da6e8d0-…` | the title and herdr's `agent_session` value of `dgs-214` | match |
| 2 | Fresh `claude -p` session | `aad279a7-…` | equals the `session_id` in the JSON result and the new file name | match |
| 3 | `claude -p --resume <id>` | same id | same file, appended (59 lines) | match |
| 4 | `claude -p --continue` | same id | same file | match |
| 5 | Interactive fresh session (scratch tab in w2) | `2358b163-…` | file `2358b163-….jsonl` | match |
| 6 | Interactive `/clear`, same process | `1e91eddd-…` (new) | new file `1e91eddd-….jsonl` | updates, as documented |
| 7 | Interactive `claude --resume 2358b163-…` | `2358b163-…` | same file, appended | match |
| 8 | Interactive `claude --continue` | `2358b163-…` (most recent) | same file, appended | match |
| 9 | Interactive `--resume 1e91eddd-… --fork-session` | `d291d285-…` (new) | new file `d291d285-….jsonl` | new id, new file, match |
| 10 | A subagent's Bash (haiku, Agent tool) | the parent's id `2da6e8d0-…` | the subagent file lives under `<parent>/subagents/` | parent id, as the counter expects |

In all ten cases the value equals the id of the transcript file that session writes to. The variable is not in Claude Code's own process
environment (`ps eww` shows none): it is added to each Bash subprocess, which is why it follows `/clear` and forks.

Scratch sessions used only `~/.claude/projects/…scratchpad-sid-test*` folders (new, empty of any ticket). The scratch herdr tab (`w2:t1C`) was my own
and is closed. No other agent or tab was touched.

## Candidates not chosen
- **(a) SessionStart hook with `CLAUDE_ENV_FILE`.** It works (the hook gets `session_id` and `source`: startup, resume, clear, compact, fork), but it
  would export the very variable Claude Code already sets, adds a hook to the plugin, and hooks inside a subagent carry `agent_id` that we would
  have to handle. Not needed.
- **(b) herdr `agent_session.value`.** It matches (case 1) but exists only inside herdr, and needs a socket call. A Desktop session has none. Not used
  as a source. It stays a cross-check in `dg tokens` runs by hand.
- **The plan's old rule (newest transcript in the cwd folder).** Dropped.

## Edge cases and how the design covers them
- **Subagents:** their Bash reports the parent's id, and the counter reads subagent files through the parent. One `session` line per ticket session is enough.
- **`/clear`:** a new id and a new file. The `init` resume path (plan Task 8) appends a `session` line for the new id. A step window continues in the
  new session only when the step skill writes a new `step-start` there. Steps that span a `/clear` fall back to the registry's `session` lines plus
  fallback tagging (a known limit, listed in the README).
- **`--resume` and `--continue`:** the same id, the same file. The `session` subcommand skips the append when the id is already registered for the ticket.
- **Fork:** a new id, a new file. It gets its own `session` line the first time a skill runs in it.
- **Variable missing** (an old Claude Code, a non-Claude harness, a script outside Claude): warn and write nothing. The fallback tagging still finds the
  session by title, branch and cwd. `--session-id` is the manual override.
- **Documented, not internal:** the variable is on the official environment variables page. The risk that it changes stays small. The safety net is
  the `--session-id` override and the transcript-exists warning.

## Plan changes
`plan.md` Tasks 7 to 10 now use this choice: the blocker note is marked resolved, Task 7's `session` subcommand resolves flag then env (with tests c to c4
for the env cases), Task 8 states the `/clear`, `--resume` and fork behavior, Task 10's scratch run also uses only the env variable, and the risk list names
the remaining risk. No other task text changed.

## Cost of the test
About ten small haiku turns: three `claude -p` runs (fresh, resume, continue), one interactive scratch session restarted four times, and one subagent. A few
thousand output tokens in all.
