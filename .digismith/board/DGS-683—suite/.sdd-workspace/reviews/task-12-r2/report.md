### Finding Verdicts

- **F1 (positional pane after an option is never checked)** — ADDRESSED. `relocate_check` now parses argv (herdr-ws:77-93): a flag's value is consumed with the flag, so it is never read as the positional; the one positional is added to `panes` and checked. I re-ran the r1 reproduction against a copy of the script with a fake herdr (HERDR_SCOPE=default:w2): `pane move --target-pane w2:p1 w9:p1` -> exit 3 "w9:p1 is not in the scope", nothing forwarded. Also `--tab w9:t1 w2:p1`, `--workspace w9 w2:p1`: refused. A second positional (`w2:p1 w9:p1`) is refused.
- **F2 (`--flag=value` form skips the check)** — ADDRESSED. Any dash argument containing `=` is refused (herdr-ws:81). I re-ran the r1 reproduction `pane move w2:p1 --tab=w9:t1` -> exit 3, nothing forwarded. Also `--target-pane=w9:p1`, `--workspace=w9` (move), `--target-pane=w9:p1`, `--source-pane=w2:p1` (swap): all refused.
- **F3 (audit names only the first pane)** — ADDRESSED. `audit()` takes a list of (target, workspace) and writes one line per item outside HERDR_WS (herdr-ws:100-112). Re-ran with scope w2,w9 and HERDR_WS=w2: `move w2:p1 --tab w9:t1` -> one line (w9); `move --target-pane w2:p1 w9:p1` -> one line (w9:p1); `swap --pane w2:p1 --target-pane w9:p1` -> one line (w9:p1); `move w2:p1 --tab w2:t2` -> nothing written.
- **F4 (no tests for the option order and `=` form)** — ADDRESSED. Diff adds 74 test lines covering the cases in the brief. I did not re-run the suite as a whole claim check beyond one run: `vitest run herdr-ws.test.ts` -> 51/51 pass.

Other shapes I re-ran (fake herdr, scope default:w2): `--new-workspace`, `--current`, bare `--`, `-x`, `--tab` without a value -> all refused. Swap with only `--pane` + `--direction`, swap with a positional -> refused. Allowed and forwarded as intended: `move w2:p1 --focus --new-tab`, `move --tab w2:t2 --target-pane w2:p2 w2:p1`, `move --label w9:p1 w2:p1` (the label text is not a pane), `swap --pane w2:p1 --target-pane w2:p2`.
Castle (scope Castle:w2,w9, fake agents tc-dgs-1 at w2:p1, tc-dgs-9 at w9:p1, a non-ticket one at w2:p2): `move --target-pane w2:p2 w2:p1` and `move --workspace w9 w2:p2` refused (not tc-/nw-); `move --target-pane w2:p1 w9:p1` (both tc-) forwarded, correct.

### New Breakage in the Fix Diff

None. One observation, not a defect: a move to a tab (`--tab w9:t1`) logs the tab id as the target, so the line goes to `_unmapped.log` rather than the ticket log of the pane's agent. The spec says one line per target outside the caller's workspace, which this meets.

### Out-of-Scope Observations

None.

### Verdict

**Fix round:** All findings addressed, no new Critical/Important breakage.

Ledger note (plan example for `agent prompt dgs-2` vs its rule): agree the rule wins; no code change.

```json findings
[]
```
