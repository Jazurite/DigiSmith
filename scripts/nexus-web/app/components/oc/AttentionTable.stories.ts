import AttentionTable from './AttentionTable.vue'
import { attentionFixture } from '../../../tests/oculus-fixtures'

const NOW = Date.parse('2026-10-22T03:00:00.000Z')
const a = attentionFixture()
const meta = {
  title: 'Oculus/AttentionTable', component: AttentionTable,
  decorators: [() => ({ template: '<div class="oc"><story /></div>' })],
}
export default meta

export const Default = { args: { open: a.open, resolved: a.resolved, nowMs: NOW } }
export const Empty = { args: { open: [], resolved: [], nowMs: NOW } }
