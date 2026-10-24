import OcAgentsTable from './OcAgentsTable.vue'
import { liveFixture } from '../../../tests/oculus-fixtures'

const meta = {
  title: 'Oculus/AgentsTable', component: OcAgentsTable,
  decorators: [() => ({ template: '<div class="oc"><story /></div>' })],
}
export default meta

const live = liveFixture()
export const Connected = { args: { agents: live.agents, disconnected: false } }
export const Disconnected = { args: { agents: live.agents, disconnected: true } }
export const Empty = { args: { agents: [], disconnected: false } }
