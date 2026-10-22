import ScanCard from './ScanCard.vue'
import { overviewFixture } from '../../../tests/nightwatch-fixtures'

const scan = overviewFixture().scan
const meta = {
  title: 'Nightwatch/ScanCard', component: ScanCard,
  decorators: [() => ({ template: '<div class="nw"><story /></div>' })],
}
export default meta

export const Away = { args: { scan, lockTicket: 'DGS-590' } }
export const BreakerOpen = { args: { scan: { ...scan, away: false, breakerOpen: true, breakerStreak: 3 }, lockTicket: null } }
export const NoScanYet = { args: { scan: { ...scan, away: false, nightWindow: false, lastScanAt: null, candidates: null }, lockTicket: null } }
