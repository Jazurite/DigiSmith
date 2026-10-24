# Review findings

| Reviewer type | Round | Path:line | Severity | What is wrong | Failing scenario | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| task 1 | 1 | skills/study/SKILL.md:74 | Minor | The order does not say which ticket key the researcher run uses, while the researcher card's `dg run start` requires --ticket <KEY> and the study ticket is written only at the end. | A conductor reads the order, reaches `dg run start --ticket <KEY>`, and has no key because the Spike does not exist yet. | fixed (commit 7906dcd) |
