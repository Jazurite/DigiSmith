# `subagent-driven-development`'s mechanical-tier offload prerequisite check needs a real check, not a shell env-var echo

**Status:** Not applied. Captured live during H.1 (Saved Finish Option)'s build, 2026-09-08.

## The bug

`subagent-driven-development`'s "mechanical-tier auto-offload" paragraph lists unmet prerequisites
that justify falling back to a normal Claude `Agent`-tool dispatch instead of routing a task's
first attempt through `digismith:offload-implementer`: "runner not on PATH, credential env var
unset, `print-config.ts` exits non-zero, Depot's readiness check fails." When executing H.1's
plan, the controller checked "credential env var unset" via a bare shell `echo $TOKENREPLY_API_KEY`
in its own process — which came back empty — and concluded the prerequisite was unmet, falling
back to Claude for both of that plan's tasks.

This was wrong. `scripts/model_offload.ts`'s `getCredential()` (and, by the same convention,
whatever `offload-implementer`'s own credential resolution does) falls back to reading
`~/.digismith-depot/.env` when the process env var is unset — and that file **did** have
`TOKENREPLY_API_KEY` set on the machine in question. The bare env-var echo is not equivalent to
the real resolution path, so it produced a false "unmet" verdict.

## Why not fixed on the spot

Jack noticed and asked about it live; by the time it was caught, both of H.1's tasks were already
implemented, reviewed (one with a clean fix round), and the final whole-branch review was already
in flight against Claude-authored code. Jack's call: leave the already-done work as-is (task
quality doesn't depend on which model wrote it, and both tasks passed review clean) rather than
discard and redo through the offload path — but capture the actual process gap for next time
rather than let it recur silently.

## The fix, not yet applied

`subagent-driven-development`'s own text should tell a controller to check prerequisites the same
way `offload-implementer`'s own Step 1 would — i.e., actually run
`print-config.ts --role mechanical --runner <resolved-runner>` (or equivalent) and read its real
exit code / output, never a shell env-var proxy check in the controller's own process. The
credential-env-var case specifically needs the same file-fallback resolution `getCredential()`
already implements, not a bare `echo`/`test -n "$VAR"`.

## Open questions

- Should this be a one-line wording fix in `subagent-driven-development`'s "mechanical-tier
  auto-offload" paragraph (spell out "check via `print-config.ts`, never a bare env-var read"), or
  does the paragraph need a small explicit checklist of the exact commands a controller should run
  for each of the four named unmet-prerequisite cases?
- Does this affect only the mechanical-tier auto-offload path, or does the same shallow-check risk
  exist anywhere else a controller decides whether task-offload credentials are available (e.g.
  `digismith:offload-implementer`'s own explicit-request entry point)?
