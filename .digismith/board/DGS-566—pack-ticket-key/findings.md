# Review findings

| Reviewer type | Round | Path:line | Severity | What is wrong | Failing scenario | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| task 1 | 1 | packages/cli/src/reviewer/index.ts:130 | Minor | The --ticket option is required in effect but not marked required, so --help does not say so. | A user runs `dg reviewer pack --help`, sees no required mark, omits --ticket, and gets `ticket: required` only at run time. | parked (Minor polish; the plan's Self-Review chose buildPack's "ticket: required" error over yargs demandOption on purpose, same result and same error format) |
| task 2 | 1 | skills/reviewer/SKILL.md:58 | Minor | New placeholder `<ticket folder>` may not match the term other skills use for the same path (`board folder`). | A Reviewer or Builder reads report-implementation, which says board folder, and the card, which says ticket folder, and is unsure whether they name the same folder. | parked (Minor wording drift; the plan's card test forbids the phrase "board folder", so the rename was needed, aligning other docs is a later cleanup) |
| task 3 | 1 | - | - | approved, no findings | - | - |
| ticket | 1 | - | - | approved, no findings | - | - |
