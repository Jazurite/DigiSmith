# DGS-592: Nightwatch: the controller's verdict reader uses the latest ruling across rounds, as dg reviewer table does

**Key:** DGS-592

Full text: `dg clickup get-task DGS-592`. Brief: `.digismith/sessions/dgs-592/brief.md`. Bug, Normal, B.6 Nightwatch. Sign-off: Auto. Found by the DGS-591 ticket review (F1, Minor, parked).

Wanted: the verdicts observer in `packages/cli/src/autonomous/observers-real.ts` reads only the ledger entries of a pack's own round. A finding marked `fixing` in r3 that gets its final ruling in r4 stays "findings" for the controller, while `dg reviewer table` shows it fixed [r4]. The observer must take each finding's latest ruling across rounds from the same model `dg reviewer table --json` builds (no second rule).

Test: r3 `fixing` + r4 `fixed` for an Important finding -> the controller sees no open finding.
