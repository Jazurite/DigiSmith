import LastEvents from './LastEvents.vue'
import { overviewFixture } from '../../../tests/nightwatch-fixtures'

const meta = {
  title: 'Nightwatch/LastEvents', component: LastEvents,
  decorators: [() => ({ template: '<div class="nw"><story /></div>' })],
}
export default meta

export const Default = { args: { events: overviewFixture().lastEvents } }
export const Empty = { args: { events: [] } }
