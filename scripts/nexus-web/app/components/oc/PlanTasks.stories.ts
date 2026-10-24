import PlanTasks from './PlanTasks.vue'
import { planFixture } from '../../../tests/oculus-fixtures'

const meta = {
  title: 'Oculus/PlanTasks', component: PlanTasks,
  decorators: [() => ({ template: '<div class="oc"><story /></div>' })],
}
export default meta

export const Default = { args: { plan: planFixture() } }
