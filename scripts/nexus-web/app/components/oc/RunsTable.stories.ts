import RunsTable from './RunsTable.vue'
import { runsFixture } from '../../../tests/oculus-fixtures'

const NOW = Date.parse('2026-10-22T03:00:00.000Z')

const meta = {
  title: 'Oculus/RunsTable', component: RunsTable,
  decorators: [() => ({ template: '<div class="oc"><story /></div>' })],
}
export default meta

export const Default = { args: { runs: runsFixture().runs, nowMs: NOW } }
export const Empty = { args: { runs: [], nowMs: NOW } }
