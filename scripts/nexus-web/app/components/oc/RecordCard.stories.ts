import RecordCard from './RecordCard.vue'
import { runDetailFixture } from '../../../tests/oculus-fixtures'

const meta = {
  title: 'Oculus/RecordCard', component: RecordCard,
  decorators: [() => ({ template: '<div class="oc"><story /></div>' })],
}
export default meta

export const Default = { args: { record: { ...runDetailFixture().record, created: '2026-10-22T03:11:02.000Z', pane: 'w2 / 5 / 2' } } }
