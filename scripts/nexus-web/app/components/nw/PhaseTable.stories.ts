import PhaseTable from './PhaseTable.vue'
import { overviewFixture } from '../../../tests/nightwatch-fixtures'

const NOW = Date.parse('2026-10-22T03:00:00.000Z')
const meta = {
  title: 'Nightwatch/PhaseTable', component: PhaseTable,
  decorators: [() => ({ template: '<div class="nw"><story /></div>' })],
}
export default meta

export const Default = { args: { rows: overviewFixture().tickets.rows, lockTicket: 'DGS-590', windowDays: 7, nowMs: NOW } }
export const Empty = { args: { rows: overviewFixture().tickets.rows.map((r) => ({ ...r, count: 0, oldestSince: null })), lockTicket: null, windowDays: 7, nowMs: NOW } }
