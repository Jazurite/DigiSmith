import WorkersTable from './WorkersTable.vue'
import { overviewFixture, runFixture } from '../../../tests/oculus-fixtures'

const NOW = Date.parse('2026-10-22T03:00:00.000Z')
const meta = {
  title: 'Oculus/WorkersTable', component: WorkersTable,
  decorators: [() => ({ template: '<div class="oc"><story /></div>' })],
}
export default meta

// Task 9: a conductor run has no health flag
const conductor = runFixture({ run: 'conductor-20261022T000500-bb11bb', ticket: null, role: 'conductor', project: 'DigiSmith', source: 'auto', trigger: 'unknown', phase: null, startedAt: '2026-10-22T00:05:00.000Z' })
export const Default = { args: { workers: [...overviewFixture().workers, conductor], nowMs: NOW } }
export const Empty = { args: { workers: [], nowMs: NOW } }
