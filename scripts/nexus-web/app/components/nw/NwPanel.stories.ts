import NwPanel from './NwPanel.vue'

const meta = {
  title: 'Nightwatch/Panel', component: NwPanel,
  decorators: [() => ({ template: '<div class="nw"><story /></div>' })],
}
export default meta

export const Loading = { args: { kind: 'loading' } }
export const Empty = { args: { kind: 'empty', title: 'Nothing waits for you.' } }
export const ErrorPanel = { args: { kind: 'error', title: 'The runs are not available.', retrying: false } }
export const RetryingPanel = { args: { kind: 'error', title: 'The runs are not available.', retrying: true } }
