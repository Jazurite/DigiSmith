import NwNav from './NwNav.vue'

const meta = {
  title: 'Nightwatch/Nav', component: NwNav,
  decorators: [() => ({ template: '<div class="nw" style="max-width:200px"><story /></div>' })],
}
export default meta

export const AttentionBadge = { args: { attention: 2, current: 'attention' } }
export const NoBadge = { args: { attention: 0, current: 'operations' } }
