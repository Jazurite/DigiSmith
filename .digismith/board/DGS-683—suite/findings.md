# Review findings (DGS-683, whole ticket)

Parts 2 and 5 have their own files (findings-part2.md, findings-part5.md). This file covers parts 1, 3, 4, 6 and the rename.

- **Tasks T1 to T9, T13 to T16, T22, rename:** each reviewed in rounds r1 and r2 where needed. All findings fixed or answered; none open.
- **Whole-branch ticket-final r1 (opus): NOT READY.** 1 Critical, 3 Important, 3 Minor.
  - F1 Critical: the factory's own `dg run start` was refused by the driver check (no `DIGISMITH_NAME`). Fixed: `driverRefusal` passes a factory-mode record on the factory lock's ticket when no name is set; another name is still refused (26da0d8c).
  - F2 Important: the driver record outlived the lock. Fixed: `runRelease` releases a factory-mode record, the claim accepts a re-claim by the same conductor (cf9cd793).
  - F3 Important: a `--pane` run stored the Castle session. Fixed: it stores `default` (ea42efc1).
  - F4 Important, F5 Minor: a Castle conductor lists its own workspace; an old default entry keeps the unfiltered tab list (b46f1fa2).
  - F6, F7 Minor: no registry write-back of an empty or non `w<digits>` id; `RELAUNCH_SLEEP` configurable (beb0b565).
- **Whole-branch ticket-final r2 (opus): all F1 to F7 addressed.** Two new Minor, fixed by the Maestro-checked fixes and verified by the conductor, no r3:
  - F8: a re-claim accepted a stale record but a later failed step did not release it (df71443a).
  - F9: release derived the depot from the autonomous dir, not from conductors.json (3ca95ee4).
- **Known limit, not fixed:** `defaultDeps` in `autonomous/index.ts` ignores `DIGISMITH_DEPOT_DIR`.
- **Known base failures (also fail on origin/main ee9549d6):** `guardrails.test.ts` scan_every_minutes, `autonomous/index.test.ts` busy hand builder, `run/index.test.ts` 7-day list.
