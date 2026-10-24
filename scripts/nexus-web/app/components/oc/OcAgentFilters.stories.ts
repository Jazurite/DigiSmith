import OcAgentFilters from './OcAgentFilters.vue'
import { liveFixture } from '../../../tests/oculus-fixtures'

const meta = {
  title: 'Oculus/AgentFilters', component: OcAgentFilters,
  decorators: [() => ({ template: '<div class="oc"><story /></div>' })],
}
export default meta

export const Default = { args: { modelValue: { status: '', role: 'conductor', project: '', workspace: '' }, agents: liveFixture().agents } }
