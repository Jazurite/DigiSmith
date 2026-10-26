# Review findings

| Reviewer type | Round | Path:line | Severity | What is wrong | Failing scenario | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| task 1 | 1 | scripts/nexus-web/app/utils/use-now.test.ts:20 | Minor | afterEach calls scope.stop() unguarded, so a setup that throws leaves scope undefined and hides the real failure behind a second error. | A test fails inside setup() before scope is assigned (first test of the file, or an earlier scope is stale): afterEach throws TypeError on undefined. | fixed (a50ec06e) |
| task 2 | 1 | scripts/nexus-web/app/components/oc/PipelineBar.vue:21 | Minor | The three-span step markup is duplicated between the OcTick branch and the v-else branch (plan-mandated). | A later edit to the sr, time or dur span in one branch and not the other makes the current step render differently from the other steps. | rejected (duplicated 3-span block in PipelineBar.vue is plan-mandated; reviewer said leave it if kept) |
| task 2 | 1 | scripts/nexus-web/app/components/oc/tick.test.ts:69 | Minor | No test that an ended WorkersTable row keeps its frozen Elapsed text and does not read the clock. | A change that moves the ended-row branch (WorkersTable.vue:25) into OcTick would make an ended worker keep counting, and no test fails. | fixed (36c4a6fe) |
| task 3 | 1 | scripts/nexus-web/tests/e2e/oculus.spec.ts:252 | Minor | The text is read once with textContent straight after page.clock.runFor, with no retry (plan-mandated). | If the browser reads the cell before Vue flushes the tick's re-render, expect(after).not.toBe(before) fails on a loaded machine. | fixed (1d1794c8) |
| ticket | 1 | - | - | approved, no findings | - | - |
