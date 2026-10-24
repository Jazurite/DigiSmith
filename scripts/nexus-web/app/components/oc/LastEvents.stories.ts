import LastEvents from './LastEvents.vue'
import { overviewFixture } from '../../../tests/oculus-fixtures'

const meta = {
  title: 'Oculus/LastEvents', component: LastEvents,
  decorators: [() => ({ template: '<div class="oc"><story /></div>' })],
}
export default meta

export const Default = { args: { events: overviewFixture().lastEvents } }
export const Empty = { args: { events: [] } }
