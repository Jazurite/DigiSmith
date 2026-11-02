# Review findings

| Reviewer type | Round | Path:line | Severity | What is wrong | Failing scenario | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| task 1 | 1 | packages/cli/src/autonomous/already-done.ts:39 | Minor | The board prefix uses key.toUpperCase(), but the spec says compare the key case-insensitively; no test has a lower-case board folder. | A board folder `dgs-7—x` holding only docs counts as a merge and the scan skips the ticket wrongly. | fixed (13ad33a5) |
| task 1 | 1 | packages/cli/src/autonomous/already-done.test.ts | Minor | No test feeds a path that git quotes (tab or quote in the name). | Breaking the safe-direction handling of quoted paths passes the suite. | fixed (13ad33a5) |
| task 2 | 1 | - | - | approved, no findings (note on the fake's args.includes('log'): no change) | - | - |
| ticket | 1 | - | - | ready to merge, no findings | - | - |
