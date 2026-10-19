# report-implementation: accept role mode's final review (no 'Final review (...)' ledger line)

**Key:** DGS-570
**List:** B.5 Autonomous Engineering
**Status:** refinement (Sign-off Auto)

Found in the first role-mode build (DGS-566, 2026-10-18): `digismith:report-implementation` expects a 'Final review (...)' line in the SDD ledger. In role mode the final review is a ticket Reviewer worker and SDD's Role Mode section writes 'Task final: review requested' and verdict lines instead, so the Builder had to add the line by hand. Make report-implementation read the role-mode lines (or have Role Mode write the expected line). Related: DGS-529, DGS-562, DGS-566.
