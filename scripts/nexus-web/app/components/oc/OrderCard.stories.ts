import OrderCard from './OrderCard.vue'
import { runDetailFixture } from '../../../tests/oculus-fixtures'

const meta = {
  title: 'Oculus/OrderCard', component: OrderCard,
  decorators: [() => ({ template: '<div class="oc"><story /></div>' })],
}
export default meta

export const Available = { args: { order: runDetailFixture().order } }
export const NotAvailable = { args: { order: { available: false, text: '' } } }
