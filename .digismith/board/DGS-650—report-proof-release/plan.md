# DGS-650 plan: report counts a proof as a proof

Spec: `spec.md` in this folder. Work in the worktree `.worktrees/dgs-650`. Test first in every task. Fake data only (`FakeTracker`, a temp ledger dir, `appendEvent`), no live ClickUp.

Setup (fresh worktree, never in the depot clone): `pnpm install --frozen-lockfile`, then `pnpm --filter @digismith/clickup-client build` if the import fails.
Run tests: `pnpm vitest run packages/cli/src/autonomous`.

### Task 1: The `proof` result in release and breaker
Files: `packages/cli/src/autonomous/release.ts`, `breaker.ts`, `index.ts`, `release.test.ts`, `breaker.test.ts`.
1. Test first:
   - `release.test.ts`: `a proof release clears the lock, comments "Autonomous Operation proof (<time>): <reason>" and writes no attention item`; `a proof release writes a release event with result proof`; `a proof release does not change the breaker streak` (copy the pattern of the existing "merged resets the streak; stopped and awaiting-jack change nothing" test).
   - `breaker.test.ts`: `proof changes nothing`.
   - `release.test.ts`: `a merged release without a commit returns a warning`; `a merged release with a commit returns no warning`.
2. Run the tests: they fail.
3. `release.ts`: `ReleaseResult` gets `"proof"`. After the `failed` block, `if (a.result === "merged" && !a.commit) warning = "merged without --commit, the report will show commit unknown";`. The comment line already covers every result but `merged`.
4. `breaker.ts`: widen the `result` type in `recordRelease` with `"proof"` (no logic change, it already ignores all but merged and failed).
5. `index.ts`: add `"proof"` to `RESULTS`. Check `pnpm vitest run packages/cli/src/autonomous/index.test.ts` still passes; add the `--result` choices case there if it lists them.
6. Run the tests: pass.
7. Commit: `feat(autonomous): release result proof`

### Task 2: The report shows proofs on their own line, and the commit
Files: `packages/cli/src/autonomous/report.ts`, `report.test.ts`.
1. Test first, in `report.test.ts` (ledger via `appendEvent`, as the other tests do):
   - `a proof release shows under Proofs and in neither Failed or stopped nor Waiting for Jack`: events `proof` for DGS-642 with reason "first-use proof"; slice the text between section headers; assert `Proofs` has `DGS-642: first-use proof`, the other two sections are `none`.
   - `Proofs reads none when there is no proof`.
   - `a proof without a reason prints only the key`.
   - `a stopped release still shows in both Failed or stopped and Waiting for Jack` (the existing test stays as is).
   - `every merged release shows its commit`: two merged events with commits, none says `unknown`.
   - `a merged release without a commit reads "commit unknown (none given at release)"`.
   - Update the section-order assertions in the existing tests if any check the whole text.
2. Run the tests: they fail.
3. `report.ts`: `const proofs = releases.filter((e) => e.result === "proof").map((e) => \`${str(e.ticket)}${e.reason ? \`: ${str(e.reason)}\` : ""}\`)`. Print `"Proofs", list(proofs), ""` after "Waiting for Jack". Built line: `commit ${str(e.commit) || "unknown (none given at release)"}`. Update the existing `not.toContain("commit unknown")` test only if it breaks.
4. Run the tests: pass.
5. Commit: `feat(autonomous): report proofs on their own line`

### Task 3: Final check
1. `pnpm vitest run packages/cli/src/autonomous`, then `pnpm -r typecheck` if the repo has that script. All green.
2. `grep -rn "Failed or stopped" . --include=*.md --exclude-dir=node_modules --exclude-dir=board --exclude-dir=.worktrees`: if a doc describes the report sections, add the `Proofs` line in the same style and commit `docs(autonomous): document the Proofs section`. If none, skip.
3. No live ClickUp call in any test or step. The first use (spec.md) is the conductor's, after the merge.
4. Merge needs the Maestro: `packages/cli/src/autonomous/` is protected.
