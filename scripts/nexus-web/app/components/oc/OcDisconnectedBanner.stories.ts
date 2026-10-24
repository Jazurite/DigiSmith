import OcDisconnectedBanner from './OcDisconnectedBanner.vue'

const meta = {
  title: 'Oculus/DisconnectedBanner', component: OcDisconnectedBanner,
  decorators: [() => ({ template: '<div class="oc"><story /></div>' })],
}
export default meta

export const WithTime = { args: { asOf: '2026-10-22T02:20:00.000Z' } }
export const NoListYet = { args: { asOf: null } }
