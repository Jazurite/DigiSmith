# Review findings

| Reviewer type | Round | Path:line | Severity | What is wrong | Failing scenario | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| task 1 | 1 | packages/cli/src/clickup/field-set.ts:215 | Minor | Text read-back is not trimmed although the spec says text compares after the parseFieldArg trim. | ClickUp returns "hello " for a text field set to "hello": reported as a mismatch. | fixed (71b2941d) |
| task 1 | 1 | packages/cli/src/clickup/field-set.ts:215 | Minor | A checkbox set to false that ClickUp returns as unset is reported as a mismatch with got (empty). | --field Done=false on a task whose Done checkbox has no stored value: exit 1 after the retry. | fixed (71b2941d) |
| task 2 | 1 | packages/cli/src/clickup/create-task.ts:42 | Minor | The retry set is picked by field name instead of field id. | Two list fields with the same name: a mismatch on one would re-send both. | fixed (retry set by field id) |
| task 2 | 1 | packages/cli/src/clickup/create-task.test.ts:86 | Minor | The persistent-mismatch test does not assert that the retry call happened. | A change that drops the retry on the failing path still passes this test. | fixed (retry assertions) |
| task 3 | 1 | - | - | approved, no findings | - | - |
| ticket | 1 | packages/cli/src/clickup/create-task.ts:411 | Important | A retry that cures a mismatch prints nothing, so the retry line the spec counts on as evidence for the open cause never appears. | First read-back returns Mode 0 (Autonomous), the retry write makes it 1 (Manual): output is only the task JSON and exit 0, with no trace that ClickUp dropped the value. | fixed (db6cdfd4, 4d39e50c) |
| ticket | 1 | packages/cli/src/clickup/create-task.ts:410 | Minor | A field given twice fails the read-back even though the last value was written as asked. | --field "Mode=Manual" --field "Mode=Autonomous": Autonomous is stored, the Manual entry mismatches, the retry rewrites both, exit 1 with 'wanted Manual (1)'. | fixed (db6cdfd4, 4d39e50c) |
| ticket | 1 | packages/cli/src/clickup/create-task.ts:418 | Minor | The mismatch error names only the task id, not its key, which spec item 4 asks for. | A failing create prints 'task 86abc123 was created, ...' instead of 'task DGS-123 (86abc123) was created, ...'. | fixed (db6cdfd4, 4d39e50c) |
| ticket | 2 | - | - | approved, no findings | - | - |
