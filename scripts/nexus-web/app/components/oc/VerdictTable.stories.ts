import VerdictTable from './VerdictTable.vue'
import { planFixture } from '../../../tests/oculus-fixtures'

const meta = {
  title: 'Oculus/VerdictTable', component: VerdictTable,
  decorators: [() => ({ template: '<div class="oc"><story /></div>' })],
}
export default meta

export const Default = { args: { verdicts: planFixture().verdicts, ledgerError: false } }
export const LedgerUnreadable = { args: { verdicts: [], ledgerError: true } }
