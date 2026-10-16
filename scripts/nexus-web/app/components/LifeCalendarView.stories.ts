import { BEFORE_BIRTH, fixture, PAST_LAST_ROW } from '../../tests/fixtures'
import LifeCalendarView from './LifeCalendarView.vue'

const meta = { title: 'Widget/Life Calendar', component: LifeCalendarView, args: { retrying: false } }
export default meta

export const Loaded = { args: { state: { kind: 'loaded', data: fixture() } } }
export const Loading = { args: { state: { kind: 'loading' } } }
export const ApiError = { args: { state: { kind: 'error' } } }
export const KeyUnavailable = { args: { state: { kind: 'locked' } } }
export const Empty = { args: { state: { kind: 'empty' } } }
export const BeforeBirth = { args: { state: { kind: 'loaded', data: BEFORE_BIRTH() } } }
export const PastNinetyYears = { args: { state: { kind: 'loaded', data: PAST_LAST_ROW() } } }
