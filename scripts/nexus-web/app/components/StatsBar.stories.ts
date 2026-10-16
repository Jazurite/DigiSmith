import { BEFORE_BIRTH, fixture, PAST_LAST_ROW } from '../../tests/fixtures'
import StatsBar from './StatsBar.vue'

const meta = { title: 'Components/Stats bar', component: StatsBar, args: { loading: false } }
export default meta

export const Values = { args: { totals: fixture().totals } }
export const Loading = { args: { totals: null, loading: true } }
export const Dashes = { args: { totals: null, loading: false } }
export const BeforeBirth = { args: { totals: BEFORE_BIRTH().totals } }
export const PastNinetyYears = { args: { totals: PAST_LAST_ROW().totals } }
