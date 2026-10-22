# DGS-591 design: interim `fixing` verdict lines

## Problem

A Builder writes `Review task 2 r1: F1 -> fixing (...)` when a fix starts, and later `... -> fixed (6310adc)`. `parseVerdictEntries` (`packages/cli/src/reviewer/verdicts.ts`) knows only `fixed|parked|rejected`, so it throws on the first `fixing` line. The DGS-585 ledger has 27 of them; `dg reviewer table` stops and the merge stalls. The ledger is an audit record, so the fix is in the reader, never in the ledger.

## Design

### 1. Parser (`verdicts.ts`)

- The line regex accepts `fixing` as a fourth status. Name it an interim status: `FINAL_VERDICTS = ["fixed", "parked", "rejected"]` (the `Verdict` type keeps this meaning), `type EntryVerdict = Verdict | "fixing"`.
- `VerdictEntry.verdict` becomes `EntryVerdict`.
- A reason is optional for `fixing` (the real ledger has `-> fixing` with no reason), like `fixed`. `parked` and `rejected` still need one.
- `parseVerdictLines` (the map of judgements) skips `fixing` entries: a judgement is a final ruling.

### 2. Table (`table.ts`)

- `resolve` puts `fixing` entries into the finding's history like any other entry (same target rule as DGS-572: the pack of the same round, else the latest earlier raise; an unknown finding stays an error).
- After the history is sorted (by round, ledger order inside a round): if the last entry is `fixing`, fail with `ledger line <n>: <text>: fix not finished for <task 2 r1 F1>: no final ruling after the fixing line`. All unfinished findings are collected and named in one error, first by line.
- The ruling shown is the latest final entry. A finding that has only `fixing` lines fails the same way (its last entry is `fixing`).
- Markdown rows: the verdict cell shows the latest final ruling and its `[rN]` suffix as now. `fixing` never shows in findings.md.
- `--json` schema 1: `history` lists every entry, `fixing` ones with `verdict: "fixing"`. `latestRound` and `latestRuling` keep their meaning: the latest final ruling. Additive only; no field changes meaning.

### 3. Autonomous observer (`autonomous/observers-real.ts`)

It reads `parseVerdictEntries` too. Today a `fixing` line throws there; after the change it would count as a ruling and call a pack "clean" while the fix runs. Rule: a blocking finding counts as ruled only when its last ledger entry for that pack round is final, not `fixing`. One test.

### 4. Docs

- `skills/subagent-driven-development/SKILL.md`, "Verdict lines": the interim line is allowed, one example `Review task 2 r1: F1 -> fixing (check every commit)`, and a final line must follow it, or the table fails with "fix not finished".
- `skills/reviewer/SKILL.md`: the same rule in one sentence with the same example.
- `sdd.test.ts` / `card.test.ts` anchor the example.

### 5. Tests (test first)

All in temp folders with fake ledgers; no ledger line is deleted or rewritten, and a test checks the ledger bytes stay the same.
- Parser: `fixing` with and without a reason; `parked` without a reason still fails; `parseVerdictLines` skips `fixing`.
- Table: the real shape (27 `fixing` lines plus finals across task and ticket packs, r2+ rulings, a reason-less `fixing`) builds the table; rows show the finals only; JSON history has the `fixing` entries.
- A lone `fixing` line fails with "fix not finished", the line number and the id. A `fixing` after a final line (a new fix started) also fails.
- Manual check: copy the DGS-585 workspace (progress.md and reviews/) to a temp folder, read-only, and run `dg reviewer table` on the copy.

## Out of scope

No new status beyond `fixing`. No change to `dg reviewer pack`. DGS-585 is merged by the conductor after this ticket.
