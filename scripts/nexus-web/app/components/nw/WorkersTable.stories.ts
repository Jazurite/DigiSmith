import WorkersTable from './WorkersTable.vue'
import { overviewFixture } from '../../../tests/nightwatch-fixtures'

const NOW = Date.parse('2026-10-22T03:00:00.000Z')
const meta = {
  title: 'Nightwatch/WorkersTable', component: WorkersTable,
  decorators: [() => ({ template: '<div class="nw"><story /></div>' })],
}
export default meta

export const Default = { args: { workers: overviewFixture().workers, nowMs: NOW } }
export const Empty = { args: { workers: [], nowMs: NOW } }
