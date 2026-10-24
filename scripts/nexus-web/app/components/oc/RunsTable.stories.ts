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
// DGS-590: the four token states in one table (fresh, stale, unpriced, none)
const base = runsFixture().runs[0]!
export const TokensStates = {
  args: {
    nowMs: NOW,
    runs: [
      { ...base, run: 'b-fresh', ticket: 'DGS-1', tokens: { total: 1_234_567, costUsd: 3.411, unpriced: [] }, tokensAsOf: '2026-10-22T02:55:00.000Z' },
      { ...base, run: 'b-stale', ticket: 'DGS-2', tokens: null, tokensAsOf: '2026-10-22T02:15:00.000Z' },
      { ...base, run: 'b-unpriced', ticket: 'DGS-3', tokens: { total: 7_000, costUsd: null, unpriced: ['claude-mystery-9'] }, tokensAsOf: '2026-10-22T02:55:00.000Z' },
      { ...base, run: 'b-none', ticket: 'DGS-4', tokens: null, tokensAsOf: null },
    ],
  },
}
