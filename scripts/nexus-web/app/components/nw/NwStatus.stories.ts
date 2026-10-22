import NwStatus from './NwStatus.vue'

const meta = {
  title: 'Nightwatch/Status', component: NwStatus,
  decorators: [() => ({ template: '<div class="nw"><story /></div>' })],
}
export default meta

export const Healthy = { args: { state: 'healthy' } }
export const Blocked = { args: { state: 'blocked' } }
export const Stalled = { args: { state: 'stalled' } }
export const Lost = { args: { state: 'lost' } }
export const Ended = { args: { state: 'ended' } }
export const Running = { args: { state: 'running' } }
export const Ok = { args: { state: 'ok' } }
export const Warn = { args: { state: 'warn' } }
export const Bad = { args: { state: 'bad' } }
