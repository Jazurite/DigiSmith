import VerdictTable from './VerdictTable.vue'
import { planFixture } from '../../../tests/nightwatch-fixtures'

const meta = {
  title: 'Nightwatch/VerdictTable', component: VerdictTable,
  decorators: [() => ({ template: '<div class="nw"><story /></div>' })],
}
export default meta

export const Default = { args: { verdicts: planFixture().verdicts, ledgerError: false } }
export const LedgerUnreadable = { args: { verdicts: [], ledgerError: true } }
