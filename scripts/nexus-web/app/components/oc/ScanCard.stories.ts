import ScanCard from './ScanCard.vue'
import { overviewFixture } from '../../../tests/oculus-fixtures'

const scan = overviewFixture().scan
const meta = {
  title: 'Oculus/ScanCard', component: ScanCard,
  decorators: [() => ({ template: '<div class="oc"><story /></div>' })],
}
export default meta

export const Away = { args: { scan, lockTicket: 'DGS-590' } }
export const BreakerOpen = { args: { scan: { ...scan, away: false, breakerOpen: true, breakerStreak: 3 }, lockTicket: null } }
export const NoScanYet = { args: { scan: { ...scan, away: false, nightWindow: false, lastScanAt: null, candidates: null }, lockTicket: null } }
