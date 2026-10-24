import OcTopBar from './OcTopBar.vue'
import { liveFixture, overviewFixture } from '../../../tests/oculus-fixtures'

const meta = {
  title: 'Oculus/Top bar', component: OcTopBar,
  decorators: [() => ({ template: '<div class="oc"><story /></div>' })],
}
export default meta

const UPDATED = Date.parse('2026-10-22T03:42:10Z')
const o = overviewFixture()

export const Healthy = { args: { overview: o, stale: false, updatedAt: UPDATED } }
export const Degraded = { args: { overview: { ...o, nexus: { status: 'degraded', reasons: ['scheduler off'] } }, stale: false, updatedAt: UPDATED } }
export const Unknown = { args: { overview: { ...o, nexus: { status: 'unknown', reasons: [] } }, stale: false, updatedAt: UPDATED } }
export const BreakerOpen = { args: { overview: { ...o, nexus: { status: 'breaker-open', reasons: [] } }, stale: false, updatedAt: UPDATED } }
export const Unreachable = { args: { overview: null, stale: true, updatedAt: null } }
export const Stale = { args: { overview: o, stale: true, updatedAt: Date.parse('2026-10-22T03:40:00Z') } }
const live = liveFixture()
export const Agents = { args: { overview: o, stale: false, updatedAt: UPDATED, live } }
export const AgentsDisconnected = { args: { overview: o, stale: false, updatedAt: UPDATED, live: { ...live, herdr: { state: 'disconnected', asOf: '2026-10-22T02:20:00.000Z' } } } }
// DGS-590: burn and seat windows. The default fixture has a fresh seat and a stale one with a past-reset window. This story has other numbers.
export const WithBurnAndSeats = {
  args: {
    overview: {
      ...o,
      burn: { tokensPerH: 18_700_000, usdPerH: 96.5, asOf: '2026-10-22T03:40:00.000Z' },
      seats: { asOf: '2026-10-22T03:40:00.000Z', seats: [
        { seat: 'jack', readAt: '2026-10-22T03:40:00.000Z', stale: false, fiveHour: { usedPct: 73, resetsAt: '2026-10-22T07:00:00.000Z' }, weekly: { usedPct: 35, resetsAt: '2026-10-26T05:00:00.000Z' } },
        { seat: 'dev0', readAt: '2026-10-22T02:50:00.000Z', stale: true, fiveHour: { usedPct: 12, resetsAt: '2026-10-22T06:00:00.000Z' }, weekly: { usedPct: 90, resetsAt: '2026-10-26T05:00:00.000Z' } },
      ] },
    },
    stale: false, updatedAt: UPDATED,
  },
}
export const StaleSeat = { args: { overview: { ...o, seats: { ...o.seats!, seats: [{ ...o.seats!.seats[1]!, weekly: null }] } }, stale: false, updatedAt: UPDATED } }
export const NoFiles = { args: { overview: { ...o, burn: null, seats: null }, stale: false, updatedAt: UPDATED } }
