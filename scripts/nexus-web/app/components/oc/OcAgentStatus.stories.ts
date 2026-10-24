import OcAgentStatus from './OcAgentStatus.vue'

const meta = {
  title: 'Oculus/AgentStatus', component: OcAgentStatus,
  decorators: [() => ({ template: '<div class="oc"><story /></div>' })],
}
export default meta

export const Working = { args: { status: 'working', disconnected: false } }
export const Idle = { args: { status: 'idle', disconnected: false } }
export const Blocked = { args: { status: 'blocked', disconnected: false } }
export const Done = { args: { status: 'done', disconnected: false } }
export const Unknown = { args: { status: 'unknown', disconnected: false } }
export const Disconnected = { args: { status: 'working', disconnected: true } }
