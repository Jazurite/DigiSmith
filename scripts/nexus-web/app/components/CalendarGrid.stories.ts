import { fixture } from '../../tests/fixtures'
import CalendarGrid from './CalendarGrid.vue'

const meta = { title: 'Components/Calendar grid', component: CalendarGrid }
export default meta

export const FullGrid = { args: { data: fixture() } }
export const SmallGrid = { args: { data: fixture('1992-06-15', { birthDate: '1990-01-01', lifeYears: 3 }) } }
