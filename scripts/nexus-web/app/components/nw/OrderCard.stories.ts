import OrderCard from './OrderCard.vue'
import { runDetailFixture } from '../../../tests/nightwatch-fixtures'

const meta = {
  title: 'Nightwatch/OrderCard', component: OrderCard,
  decorators: [() => ({ template: '<div class="nw"><story /></div>' })],
}
export default meta

export const Available = { args: { order: runDetailFixture().order } }
export const NotAvailable = { args: { order: { available: false, text: '' } } }
