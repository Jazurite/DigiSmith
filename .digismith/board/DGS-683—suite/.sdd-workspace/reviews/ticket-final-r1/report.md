# Ticket final review r1: DGS-683 part 2 (herdr-ws scope)

Range: 91554b76..fab2cd9c. Files: scripts/opencode-boot/herdr-ws, herdr-ws.test.ts. Read the whole script. Probed it with a copy that forwards to a fake herdr (no live session touched). Did not re-run vitest.

## Verdict: changes needed (1 Important, 1 Important/Minor, 2 Minor). No Critical.

## Strengths
- The argv is built by the wrapper from a validated session name. `--session` and `--socket` anywhere in the args are refused. A third session cannot be reached.
- Castle close, rename and relocate rules are label based and fail closed (unknown label = refuse). Rename judges both the old and the new name. Pane move/swap parsing is strict.
- Scope parsing, list filtering, `create` and `start` checks match spec 7.1 items 1-4.
- Files touched: only the two allowed paths.

## Findings

F1 Important: second target by flag is not checked (spec 7.1 item 2: every target in scope).
T10 checks only `rest[0]`. Any verb that also takes `--pane` is forwarded when the positional is in scope and `--pane` is not. Probed with the fake herdr, each was forwarded unchanged:
- `HERDR_SCOPE=default:w2 herdr-ws pane split w2:p1 --pane w9:p1`
- `pane focus w2:p1 --direction left --pane w9:p1`
- same shape for `pane zoom`, `resize`, `neighbor`, `input` (all list `[PANE_ID]` and `--pane <ID>`).
Also `tab create --workspace w2 --workspace=w9`: the `=` form is not counted by `a.count("--workspace")` and not refused (only relocate refuses `=`). Whether herdr takes the second value or errors is up to its parser; I did not test that against a live session. The guardrail should not depend on it. Fix idea: for every verb outside list, refuse `--flag=value` and any of `--pane`, `--workspace`, `--tab`, `--source-pane`, `--target-pane`, `--current` when a positional is also given; or check every flag value that names a pane, tab or workspace the way relocate_check does.

F2 Important (spec gap or code gap): the audit log is silent without HERDR_WS.
`audit()` returns when `HERDR_WS` is empty (line 107). Spec 7.2 gives conductors `HERDR_SCOPE` and says nothing of `HERDR_WS`. With `HERDR_SCOPE=default:w2,default:w9` and no `HERDR_WS`, `agent prompt w9:p1 hi` is forwarded and no `drivers/` file is written (probed). With `HERDR_WS=w2` set it writes `_unmapped.log`. The cross-project record then depends on an unstated env var. Fix: take "own" from a stated variable (for example `HERDR_OWN_WS`, set by the bootstrap and `start-ticket`) and either refuse or log-as-unknown when it is missing; add a test for the SCOPE-only case. If the plan sets both variables, say so in the plan and add the test.

F3 Minor: `who` is `unknown` when `DIGISMITH_NAME` is unset, and `_unmapped.log` is used for every target that is a pane id whose agent has no `dgs-N` in its name (workers named otherwise). The line is still written, so the audit is not skipped; the log is just weak for those cases. Consider recording the pane id and workspace (already there) plus the agent name.

F4 Minor: in Castle, `pane run`, `pane send-text`, `agent send-keys` and `agent prompt` to a sibling conductor in the same Castle workspace are allowed (target is in scope). Typing `exit` or Ctrl-C into a sibling conductor ends it without a close. Spec 7.1 item 4 only restricts close, so this follows the spec; noting it because the stated aim is that a non-tc- conductor cannot be closed by a sibling. Decide at the Maestro level whether to accept it.

Also noted, not findings: `label` lookup uses `find()` which falls back to a nested key when the tab's own label is empty (cannot make a non-tc- tab closable unless a nested pane carries a tc- label; low). The check-then-act on a label is not atomic (a rename between the check and the close); the same wrapper refuses rename of non-tc- names, so the window is small. `pane focus --direction left --pane X` with no positional is refused (fail closed, but it blocks a legal call).

```json findings
[
{"id":"F1","path":"scripts/opencode-boot/herdr-ws","line":159,"severity":"Important","what":"Only rest[0] is checked; a second target given as --pane (or --workspace=value) is forwarded unchecked.","scenario":"HERDR_SCOPE=default:w2 herdr-ws pane split w2:p1 --pane w9:p1 is forwarded to herdr unchanged (probed with a fake herdr). If herdr prefers --pane, the call acts in w9, outside the scope. Same for pane focus/zoom/resize/neighbor/input, and tab create --workspace w2 --workspace=w9."},
{"id":"F2","path":"scripts/opencode-boot/herdr-ws","line":107,"severity":"Important","what":"audit() returns silently when HERDR_WS is unset, but spec 7.2 gives conductors HERDR_SCOPE only.","scenario":"HERDR_SCOPE=default:w2,default:w9 and no HERDR_WS: agent prompt w9:p1 hi is forwarded and no drivers/*.log line is written (probed). The cross-project record is skipped."},
{"id":"F3","path":"scripts/opencode-boot/herdr-ws","line":116,"severity":"Minor","what":"who falls back to 'unknown' and most targets land in _unmapped.log, so the log is weak evidence.","scenario":"DIGISMITH_NAME unset and a worker not named dgs-N: line is written as who=unknown into _unmapped.log."},
{"id":"F4","path":"scripts/opencode-boot/herdr-ws","line":175,"severity":"Minor","what":"The Castle rule limits close and rename only; pane run, send-text, send-keys and prompt to a sibling conductor stay allowed.","scenario":"Conductor A runs herdr-ws --session Castle pane run <B pane> exit; B ends without any close verb. Matches spec 7.1 item 4 literally; accept or tighten."}
]
```
