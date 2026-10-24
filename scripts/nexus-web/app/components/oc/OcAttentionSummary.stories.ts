import OcAttentionSummary from './OcAttentionSummary.vue'
import { attentionFixture } from '../../../tests/oculus-fixtures'

const meta = {
  title: 'Oculus/AttentionSummary', component: OcAttentionSummary,
  decorators: [() => ({ template: '<div class="oc"><story /></div>' })],
}
export default meta

export const Items = { args: { open: attentionFixture().open } }
export const Empty = { args: { open: [] } }
