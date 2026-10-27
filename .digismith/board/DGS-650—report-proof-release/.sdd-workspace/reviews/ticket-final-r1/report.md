# Review: DGS-650 ticket final, round 1

Range: 3b5e4dd3..295e1865. Model: claude-sonnet-5-5 (as the pack states). `check-attribution`: no hit.

### Strengths
- The change is small and matches the spec point by point. `proof` joins `ReleaseResult`, `RESULTS` and the `recordRelease` type (release.ts:14, index.ts:52, breaker.ts:55).
- Behavior 1 holds with no new branch. A proof release goes through the generic path: the ticket comment `Autonomous Operation proof (<time>): <reason>` (release.ts:68), the journal, the late-release line and the run-now kick. It opens no attention item, because only `failed` does. `recordRelease` leaves the breaker alone for any result that is not failed or merged. The tests cover the comment text, the release event and an unchanged streak.
- Report: `failed` and `waiting` filters exclude `proof` (report.ts:48-52). The `Proofs` section sits after "Waiting for Jack" with `none` as the empty case, as the spec says.
- The "Built" line shows `commit unknown (none given at release)` (report.ts:47). The release returns the warning, and index.ts:318 prints it on stderr. The release still succeeds.
- The `order.ts` text is unchanged, as the spec requires.
- Tests: the section splits are anchored on heading lines, so a ticket reason that contains a heading word cannot break them.

### Issues

#### Critical (Must Fix)
None.

#### Important (Should Fix)
None.

#### Minor (Nice to Have)
1. **No warning on the no-lock path.** release.ts:89 sets the warning only inside the `else` branch (lock present). A merged release with no lock and no `--commit` writes the event with no `commit`, so the report later shows `commit unknown`, but nobody gets the stderr warning. Spec point 4 says "when a merged release has no --commit". Impact is small: a merge with no lock is already an odd case. Fix: set the warning before the lock check.
2. **Stale doc comment.** breaker.ts:52 says "stopped and awaiting-jack change nothing". It should also name `proof`.
3. **No test for the stderr line.** The tests check `r.warning` from `runRelease`, but nothing checks that index.ts prints `release: merged without --commit, ...` on stderr. The wiring is one line and correct by reading.

### Recommendations
- None beyond the minors. Merge needs the Maestro, because `packages/cli/src/autonomous/*` is protected.

### Assessment

**Ready to merge?** Yes

**Reasoning:** The implementation matches the spec, the proof result never touches the breaker or the attention list, and the report separates proofs from failures and waits. Only Minor items remain, and none of them blocks.

```json findings
[
  {
    "id": "F1",
    "path": "packages/cli/src/autonomous/release.ts",
    "line": 89,
    "severity": "Minor",
    "what": "The merged-without-commit warning is set only when a lock exists, so the no-lock path stays silent.",
    "scenario": "dg autonomous release --result merged with no lock and no --commit writes a release event with no commit; the report shows commit unknown and no stderr warning was printed."
  },
  {
    "id": "F2",
    "path": "packages/cli/src/autonomous/breaker.ts",
    "line": 52,
    "severity": "Minor",
    "what": "The doc comment lists stopped and awaiting-jack as results that change nothing, but not proof.",
    "scenario": "A reader of recordRelease does not learn that proof is also neutral."
  },
  {
    "id": "F3",
    "path": "packages/cli/src/autonomous/index.ts",
    "line": 318,
    "severity": "Minor",
    "what": "No test checks that the release command prints the warning on stderr.",
    "scenario": "Dropping the console.error line leaves every test green."
  }
]
```
