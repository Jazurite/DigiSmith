import WorkersTable from './WorkersTable.vue'
import { overviewFixture } from '../../../tests/oculus-fixtures'

const NOW = Date.parse('2026-10-22T03:00:00.000Z')
const meta = {
  title: 'Oculus/WorkersTable', component: WorkersTable,
  decorators: [() => ({ template: '<div class="oc"><story /></div>' })],
}
export default meta

export const Default = { args: { workers: overviewFixture().workers, nowMs: NOW } }
export const Empty = { args: { workers: [], nowMs: NOW } }
