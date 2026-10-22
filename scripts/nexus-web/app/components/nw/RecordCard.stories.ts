import RecordCard from './RecordCard.vue'
import { runDetailFixture } from '../../../tests/nightwatch-fixtures'

const meta = {
  title: 'Nightwatch/RecordCard', component: RecordCard,
  decorators: [() => ({ template: '<div class="nw"><story /></div>' })],
}
export default meta

export const Default = { args: { record: { ...runDetailFixture().record, created: '2026-10-22T03:11:02.000Z', pane: 'w2 / 5 / 2' } } }
