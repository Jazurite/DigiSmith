# DGS-683 ticket 6: plan extract (only this ticket's tasks)

Source: `plan.md` of this folder (approved 2026-11-01). Read also its 'Global Constraints' and 'Shared facts'. Task numbers are the plan's own.

## Ticket D: factory claim writes the driver record (protected: `autonomous/`)

### Task 22 (T22): claim and hand-over

**Files:** Modify the claim step in `packages/cli/src/autonomous/` (find it with `grep -n "claim" packages/cli/src/autonomous/act.ts advance.ts`; the existing claim-lock write is the anchor); Test: the matching `*.test.ts` (`act.test.ts` or `advance.test.ts`).

**Interfaces:** consumes `claimDriver`, `handoverDriver` (T17). When the factory claims a ticket it calls `claimDriver({ticket, driver:"factory", mode:"factory"})` right after the existing lock write; `DriverTaken` -> the claim is skipped with the existing "skipped" reason shape (`reason: "driven-by:<name>"`) and no lock is written. When a ticket conductor takes over (the factory conductor runs `dg conductor start-ticket`, T18, which calls `claimDriver`), T18 must accept a `factory` driver: change `startTicketConductor` to call `handoverDriver(ticket, "factory", name)` when the current driver is `factory` and the starter is the factory conductor (one extra test in T18's file, added by this task). The existing claim-lock behaviour and its tests stay unchanged.

- [ ] **Step 1: Write the failing tests:** claim writes both the lock and the driver file; a ticket with another driver is skipped and gets no lock; start-ticket after a factory claim hands the driver over to `tc-<key>`; with a depot that has no `drivers/` folder the claim creates it.
- [ ] **Step 2: Run, expect FAIL.** `pnpm vitest run packages/cli/src/autonomous packages/cli/src/conductor`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS** (both folders fully).
- [ ] **Step 5: Commit.** `git commit packages/cli/src/autonomous packages/cli/src/conductor -m "feat(dgs-683): the factory claim writes the driver record"`

---

