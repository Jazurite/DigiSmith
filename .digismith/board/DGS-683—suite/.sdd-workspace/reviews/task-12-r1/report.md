### Spec Compliance

- ❌ Issues found, in the pane move/swap commit (32261a68): the new scope check can be bypassed with ordinary argument shapes (F1, F2). I ran both against a copy of the script with a fake herdr: the call was forwarded. T12 (the audit log) is compliant, see below. "Suite" is read as "Castle" as asked.
- ✅ T12, spec 7.1 item 5: the log is written only in session `default`, only when `HERDR_WS` is set, only for verbs other than list/get/read, only when the target workspace differs from `HERDR_WS` (herdr-ws:92-93). Line fields are `time` (+07:00, seconds), `who` (`DIGISMITH_NAME` or `unknown`), `target`, `workspace`, `verb` as `<group> <verb>` (herdr-ws:100). The key is the first `dgs-<n>` of the agent name, uppercased, else `_unmapped.log` (herdr-ws:94-101). A write failure prints one stderr line and the call goes on (herdr-ws:102), tested with a depot path that is a file.
- Judgement A (rule over the plan's test text): accepted. The plan's rule and its example disagree for `dgs-2`; the rule is the spec text in 7.1 item 5 and the plan's own interface paragraph. Fix the plan's example line, not the code.
- Judgement B (log an attempt): accepted. A forwarded call that herdr then rejects still shows who tried; spec says "appends one line" for a call, not for a success.
- Judgement C (create logs `--workspace`; start logs the agent with the `--pane` workspace): accepted, those are the only workspaces those calls name.
- ⚠️ Cannot verify from the diff: the real `HERDR_WS`/`DIGISMITH_NAME` values are set by the bootstrap (7.2), not by this task.

### Strengths

- The audit never blocks: any exception in `audit()` is caught and reported; a refused call writes nothing because `audit()` runs after every deny (herdr-ws:164).
- `audit()` is skipped for Suite, for own-workspace targets and for an unset `HERDR_WS`; all three are in one test.
- `relocate_check` refuses implicit panes (`--current`, a swap neighbour by `--direction` alone) and `--new-workspace`, and in Suite requires every named pane to belong to a tc-/nw- agent; this closes the move-then-close bypass I noted in T11 r2.
- I ran the test file: 42/42 pass, no warnings.

### Issues

#### Critical (Must Fix)
None.

#### Important (Should Fix)
- F1, `scripts/opencode-boot/herdr-ws:77`: the positional pane of `pane move` is read only when it is `args[0]`. herdr (clap) accepts options before the positional, so `pane move --target-pane w2:p1 w9:p1` has `args[0] == "--target-pane"`: `w9:p1` is never checked. I ran it with `HERDR_SCOPE=default:w2`: forwarded, exit 0. The moved pane is `w9:p1`, outside the scope. The same order works in Suite for a pane of another workspace only if its agent is tc-/nw-, but the default session has no such limit. Fix: take the positional as the one argument that is not a flag and not the value of a flag that takes a value (`--tab`, `--split`, `--target-pane`, `--ratio`, `--workspace`), and refuse when there is more than one.
- F2, `scripts/opencode-boot/herdr-ws:70-71`: `flag_values` matches only the separate form `--tab X`. The `=` form, `--tab=w9:t1`, `--target-pane=w9:p1`, `--source-pane=...`, `--workspace=...`, is invisible to it. I ran `pane move w2:p1 --tab=w9:t1` with scope `default:w2`: forwarded unchanged, exit 0, so a pane leaves the scope. T10 already refuses `--session=`/`--socket=` for this reason; the same care is missing here. Fix: in `relocate_check`, refuse any argument that starts with `--` and contains `=`.

#### Minor (Nice to Have)
- F3, `scripts/opencode-boot/herdr-ws:148`: for `pane move` the log names only the first pane's workspace (`TWS = ws_of(TGT)`). A caller whose own workspace is w2 who moves its own pane `w2:p1` into `--tab w3:t1` writes nothing, although it acts on w3. Log when any named pane or destination is outside `HERDR_WS`.
- F4, `scripts/opencode-boot/herdr-ws.test.ts:253-285`: no test uses the option-before-positional order or the `=` form, so F1 and F2 pass 42/42. Add one case for each, after the fix.

### Assessment

**Task quality:** Needs fixes

**Reasoning:** T12 is correct and its three judgement calls hold. The pane move/swap check, which exists to close a scope hole, has two holes of its own that I reproduced: a positional pane after an option, and the `=` flag form.

```json findings
[
  {
    "id": "F1",
    "path": "scripts/opencode-boot/herdr-ws",
    "line": 77,
    "severity": "Important",
    "what": "relocate_check reads the positional pane only from args[0], so a pane placed after an option is never checked.",
    "scenario": "HERDR_SCOPE=default:w2: 'pane move --target-pane w2:p1 w9:p1' is forwarded and moves a pane of workspace w9."
  },
  {
    "id": "F2",
    "path": "scripts/opencode-boot/herdr-ws",
    "line": 70,
    "severity": "Important",
    "what": "flag_values does not see the --flag=value form, so --tab=, --target-pane=, --source-pane= and --workspace= skip the scope check.",
    "scenario": "HERDR_SCOPE=default:w2: 'pane move w2:p1 --tab=w9:t1' is forwarded and the pane lands in w9."
  },
  {
    "id": "F3",
    "path": "scripts/opencode-boot/herdr-ws",
    "line": 148,
    "severity": "Minor",
    "what": "The audit line for pane move/swap uses only the first pane's workspace, not the destination or other panes.",
    "scenario": "Caller own workspace w2 runs 'pane move w2:p1 --tab w3:t1': allowed, nothing logged although w3 is acted on."
  },
  {
    "id": "F4",
    "path": "scripts/opencode-boot/herdr-ws.test.ts",
    "line": 253,
    "severity": "Minor",
    "what": "No test covers a positional pane after an option or the --flag=value form of move/swap.",
    "scenario": "F1 and F2 stay at 42/42."
  }
]
```
