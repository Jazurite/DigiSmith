# Review findings (DGS-683 part 2, herdr-ws)

| Reviewer type | Round | Path:line | Severity | What is wrong | Failing scenario | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| task 10 | 1 | scripts/opencode-boot/herdr-ws.test.ts | Important | The "caller socket env is dropped" test cannot fail: the fake herdr never logged its env. | Delete the HERDR_SOCKET_PATH filter: all tests stay green. | fixed (e7bdc94e) |
| task 10 | 1 | scripts/opencode-boot/herdr-ws | Minor | Merged pane/tab lists dropped the envelope of the first reply. | Caller reads `id` of a merged `tab list` and gets nothing. | fixed (e7bdc94e) |
| task 10 | 1 | scripts/opencode-boot/herdr-ws | Important | A repeated `--workspace` (or `--pane`) is a scope bypass. | `tab create --workspace w2 --workspace w9` with scope default:w2. | fixed (e7bdc94e) |
| task 10 | 1 | scripts/opencode-boot/herdr-ws | Minor | Docstring silent on the `^w\d+$` check of HERDR_WS. | Operator sets HERDR_WS=2 and gets an unexplained refusal. | fixed (e7bdc94e) |
| task 11 | 1 | scripts/opencode-boot/herdr-ws | Important | Close trusts a label that `rename` can change. | A tc- conductor runs `tab rename w7:t1 tc-x`, then `tab close w7:t1`: the project conductor's tab closes. | fixed (e9914eb7) |
| task 11 | 1 | scripts/opencode-boot/herdr-ws.test.ts | Minor | No fail-closed tests (non-JSON `tab get`, `agent stop` with a pane id). | A later edit makes an unreadable label pass. | fixed (e9914eb7) |
| task 11 | 1 | scripts/opencode-boot/herdr-ws | Minor | `agent stop` branch lacks a comment: herdr has no such verb today. | A reader removes it as dead code. | fixed (e9914eb7) |
| task 11 | 2 | scripts/opencode-boot/herdr-ws | Important | `pane move`/`swap` relocate a pane into a tc- tab, so `tab close` passes the label check (Maestro observation). | Move the conductor's pane into a tc- tab, then close that tab. | fixed (32261a68) |
| task 12 | 1 | scripts/opencode-boot/herdr-ws | Important | relocate_check read the positional only from args[0]. | `pane move --target-pane w2:p1 w9:p1` forwards a w9 pane under scope default:w2. | fixed (fab2cd9c) |
| task 12 | 1 | scripts/opencode-boot/herdr-ws | Important | The `--flag=value` form was invisible to relocate_check. | `pane move w2:p1 --tab=w9:t1` leaves the scope. | fixed (fab2cd9c) |
| task 12 | 1 | scripts/opencode-boot/herdr-ws | Minor | The audit log named only the first pane or destination of a move/swap. | A move of a w3 pane into w2 logs one side only. | fixed (fab2cd9c) |
| task 12 | 1 | scripts/opencode-boot/herdr-ws.test.ts | Minor | No tests for the two bypass shapes and the log. | Regression of either bypass goes unnoticed. | fixed (fab2cd9c) |
| ticket | 1 | scripts/opencode-boot/herdr-ws:159 | Important | Only rest[0] checked; a second target by flag (`--pane`) or `--workspace=value` was forwarded unchecked. | `pane split w2:p1 --pane w9:p1` under scope default:w2 reaches herdr unchanged. | fixed (0fd4eaf2) |
| ticket | 1 | scripts/opencode-boot/herdr-ws:107 | Important | audit() was silent without HERDR_WS. | HERDR_SCOPE only, `agent prompt w9:p1 hi`: forwarded, no drivers/*.log line. | fixed (0fd4eaf2) |
| ticket | 1 | scripts/opencode-boot/herdr-ws:116 | Minor | Log lines were weak evidence (who unknown, no agent or pane). | Worker not named dgs-N: line has no agent. | fixed (0fd4eaf2) |
| ticket | 1 | scripts/opencode-boot/herdr-ws:175 | Minor | The Castle rule limits close and rename only; `pane run`/`send-text`/`send-keys`/`prompt` to a sibling conductor stay allowed. | Conductor A runs `pane run <B pane> exit`; B ends without a close verb. | accepted (spec 7.1 item 4; Maestro notes it) |
| ticket | 2 | scripts/opencode-boot/herdr-ws | Minor | The `--flag=value` refusal also catches text payload tokens. | `pane run w2:p1 git log --format=%h` is refused (fails closed). | fixed (cfb2fdb3: docstring and test, one quoted argument) |
