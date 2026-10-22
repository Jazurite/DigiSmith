import PlanTasks from './PlanTasks.vue'
import { planFixture } from '../../../tests/nightwatch-fixtures'

const meta = {
  title: 'Nightwatch/PlanTasks', component: PlanTasks,
  decorators: [() => ({ template: '<div class="nw"><story /></div>' })],
}
export default meta

export const Default = { args: { plan: planFixture() } }
