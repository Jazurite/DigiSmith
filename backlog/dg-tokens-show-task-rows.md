# `dg tokens` shows the task rows (read the saved `tokens.json` or a ledger), and fix the table label width

**Status:** Follow-up, found 2026-10-10 ~18:5x UTC+7 [11:5xZ] at the DGS-214 slice 2 merge. ClickUp: **DGS-288** (B.3: Token Economics, subtask of DGS-204, task id `14zcebrvcw3`).
Small. Not started.

**Source:** the DGS-214 slice 2 report (worker `dgs-214`, confirmed by `b3-maestro`). After the merge (`dc4f6bc`, 0.91.0-beta), `dg tokens DGS-214`
attributed the session from the registry but printed no task rows. The task rows exist: `entry.ts snapshot --ledger ... --write` wrote them into
`.digismith/board/DGS-214—count-tokens-per-ticket/tokens.json` (Tasks 1 to 10, the two Sol fix waves and the session-id test).

## The gaps

- `dg tokens <ticket>` has no `--ledger` option and does not read the saved `tokens.json`, so a finished ticket shows only step rows on the command
  line. Task rows come only from `entry.ts snapshot --ledger` or from the saved file.
- Cosmetic: in the plain-text table, a long task label (`task session-id-test`) is wider than its column and runs into the model name.

## What would close it

- `dg tokens <ticket>` merges the task rows from the saved snapshot (the same carry-forward rule `entry.ts` uses: same schema version and ticket),
  and accepts `--ledger <path>` like `entry.ts snapshot`.
- Size the label column to the longest label, or truncate with a marker.
- Tests: a saved snapshot with task rows shows them; a mismatched schema or ticket is ignored with a warning; a long label keeps the columns aligned.

## Related

DGS-214 ([count-tokens-per-ticket.md](count-tokens-per-ticket.md)), DGS-204 ([token-economics-b3.md](token-economics-b3.md)).
