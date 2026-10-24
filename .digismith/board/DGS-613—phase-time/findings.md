# Review findings

| Reviewer type | Round | Path:line | Severity | What is wrong | Failing scenario | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| task 1 | 1 | - | - | approved, no findings | - | - |
| task 2 | 1 | - | - | approved, no findings | - | - |
| task 3 | 1 | scripts/nexus-web/app/components/oc/RunsTable.vue:90 | Minor | phaseTime is called three times in the Duration cell template, and once more in spoken. | Every render of each row repeats the same pure computation; harmless now, noisy if phaseTime grows. | fixed (commit a99cbb4e) |
| task 3 | 1 | scripts/nexus-web/app/components/oc/runs.test.ts:154 | Minor | The running-row assertion was loosened to a prefix match. | A wrong phase suffix on this row would pass here; the new Duration test covers the full text. | parked (conductor ruling: the new Duration test pins the full cell text) |
| task 4 | 1 | scripts/nexus-web/app/components/oc/PipelineBar.vue:77 | Minor | stepTime(s, nowMs) is computed three times per step per render (durText, srText, live class). | Every clock tick re-renders six steps and runs stepTime 18 times; harmless at this size, but a per-step computed value would do it once. | fixed (commit 71cde7b8) |
| task 5 | 1 | - | - | approved, no findings | - | - |
| ticket | 1 | scripts/nexus-web/app/components/oc/RunsTable.vue:39 | Minor | The Duration cell uses a one-item v-for over [durationCell(r, nowMs)] to bind a per-row value, which reads like a loop. | A later maintainer reads the template, takes it for a list render, and adds a key or a second item by mistake; there is no wrong output today. | fixed (one-line comment at RunsTable.vue:39, in the merge-prep commit; no re-review per conductor) |
