# DGS-591: dg reviewer table accepts interim 'fixing' verdict lines

**Key:** DGS-591

Full text: `dg clickup get-task DGS-591`. Brief: `.digismith/sessions/dgs-591/brief.md`. Bug, High, B.5. Blocks the DGS-585 merge.

Wanted: `dg reviewer table` accepts the interim line `Review ... F<n> -> fixing (...)` as history. The latest final ruling (fixed, parked, rejected) of a finding wins. A finding whose latest line is `fixing` stays an error ("fix not finished"), with the line and the id. `--json` (schema 1) shows `fixing` in the history (additive). The SDD skill (role mode) and the Reviewer card show the `fixing` line with one example. No ledger line is ever deleted or rewritten.
