import OcNav from './OcNav.vue'

const meta = {
  title: 'Oculus/Nav', component: OcNav,
  decorators: [() => ({ template: '<div class="oc" style="max-width:200px"><story /></div>' })],
}
export default meta

export const AttentionBadge = { args: { attention: 2, current: 'attention' } }
export const NoBadge = { args: { attention: 0, current: 'oculus' } }
export const BlockedBadge = { args: { attention: 2, blocked: 1, current: 'oculus' } }
