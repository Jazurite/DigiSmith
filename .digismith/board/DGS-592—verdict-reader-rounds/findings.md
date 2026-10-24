# Review findings

| Reviewer type | Round | Path:line | Severity | What is wrong | Failing scenario | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| ticket | 1 | packages/cli/src/autonomous/observers-real.test.ts:304 | Minor | No test covers spec row 4: r3 and r4 packs both raise Important F1 and only an r4 fixed line exists, so r3 must stay findings and r4 be clean. | A later change to the same-round-first linking rule lets the r4 line close the r3 finding, and no test fails. | fixed (6924da5) |
