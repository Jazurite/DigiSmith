# Ticket final review r2: DGS-683 part 2 (scoped re-review)

Range: fab2cd9c..0fd4eaf2. Files: scripts/opencode-boot/herdr-ws, herdr-ws.test.ts. Read the fix diff and the surrounding script. Did not complete a vitest run (started it, it had not finished when this report was written); the verdicts come from reading the code.

## Verdict: approved (F1, F2, F3 fixed; F4 accepted per spec). No Critical, no Important. 1 Minor new.

## Per finding
- F1 FIXED. Every verb outside list now: refuses any `--flag=value` token (line 160), refuses `--current`, and checks each value of --pane, --tab, --workspace, --source-pane, --target-pane against WSS (lines 182-187). Move/swap stay on relocate_check. A flag with no value is ignored by the helper, but then herdr gets a flag with no value, not a second target. The check runs before audit and the forward. Tests listed in the pack cover the cases from r1.
- F2 FIXED. audit() no longer returns when HERDR_WS is unset: it logs every non-read act in the Floor with own="unknown" into `_unmapped.log`. Reads still skipped. Matches the Maestro decision.
- F3 FIXED. Each line records own, agent and pane.
- F4 ACCEPTED (spec 7.1 item 4). No code.

## New observations (none block)
N1 Minor: the `=` refusal scans every token of the call, including text payloads. `pane run w2:p1 git log --format=%h` (as separate tokens) or `agent prompt w2:p1 --x=y` is refused. It fails closed and the text can be sent as one quoted argument, so it does not block. Worth a line in the conductor docs.
N2 Minor: `--flag` followed by a value that is itself a flag (`--pane --current`) is judged by ws_of() on the flag string: it is refused as out of scope (fail closed). Fine.

```json findings
[
{"id":"N1","path":"scripts/opencode-boot/herdr-ws","line":160,"severity":"Minor","what":"The --flag=value refusal also catches tokens in a text payload, so some legal pane run / agent prompt calls are refused.","scenario":"herdr-ws pane run w2:p1 git log --format=%h is refused with the = form message; the same text as one quoted argument passes."}
]
```
