# Review findings

| Reviewer type | Round | Path:line | Severity | What is wrong | Failing scenario | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| task 1 | 1 | packages/cli/src/autonomous/index.ts | Minor | `order.ts` does not list `proof` as a result. | A Builder never learns `proof` exists. | no action (spec point 5: `proof` is for a conductor's proof run, not a Builder) |
| task 1 | 1 | packages/cli/src/autonomous/release.ts | Minor | No warning when the lock is missing. | A merged release with no lock and no `--commit` warns nobody. | no action in round 1 (matched the plan); raised again as ticket F1 and fixed |
| task 2 | 1 | packages/cli/src/autonomous/report.test.ts:66 | Minor | The test splits the report on bare words (`Proofs`, `Waiting for Jack`, `Skipped`). | A reason containing the word shifts the slice. | fixed (295e1865; splits anchor on whole heading lines) |
| ticket | 1 | packages/cli/src/autonomous/release.ts | Minor | F1: the merged-without-commit warning is set after the lock check, so the no-lock path skips it (spec point 4). | `dg autonomous release --result merged` with no lock and no `--commit` prints no warning. | fixed (0e909e43; warning set before the lock check; test: merged, no lock, no commit) |
| ticket | 1 | packages/cli/src/autonomous/breaker.ts:52 | Minor | F2: the doc comment of `recordRelease` does not name `proof`. | A reader thinks `proof` is unhandled. | fixed (c0def487) |
| ticket | 1 | packages/cli/src/autonomous/index.test.ts | Minor | F3: no test that the release command prints the warning line on stderr. | The `console.error` line could be dropped unnoticed. | fixed (a4d83d09; stderr captured, with and without `--commit`) |
| ticket | 2 | - | - | approved, no findings | - | - |
