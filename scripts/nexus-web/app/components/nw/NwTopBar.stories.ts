import NwTopBar from './NwTopBar.vue'
import { overviewFixture } from '../../../tests/nightwatch-fixtures'

const meta = {
  title: 'Nightwatch/Top bar', component: NwTopBar,
  decorators: [() => ({ template: '<div class="nw"><story /></div>' })],
}
export default meta

const UPDATED = Date.parse('2026-10-22T03:42:10Z')
const o = overviewFixture()

export const Healthy = { args: { overview: o, stale: false, updatedAt: UPDATED } }
export const Degraded = { args: { overview: { ...o, nexus: { status: 'degraded', reasons: ['scheduler off'] } }, stale: false, updatedAt: UPDATED } }
export const Unknown = { args: { overview: { ...o, nexus: { status: 'unknown', reasons: [] } }, stale: false, updatedAt: UPDATED } }
export const BreakerOpen = { args: { overview: { ...o, nexus: { status: 'breaker-open', reasons: [] } }, stale: false, updatedAt: UPDATED } }
export const Unreachable = { args: { overview: null, stale: true, updatedAt: null } }
