import WeekTooltip from './WeekTooltip.vue'

const meta = { title: 'Components/Week tooltip', component: WeekTooltip, args: { mode: 'pointer', inline: true } }
export default meta

export const Lived = { args: { info: { age: 10, week: 6, from: '2000-02-05', to: '2000-02-11', state: 'lived' } } }
export const ThisWeek = { args: { info: { age: 36, week: 42, from: '2026-10-15', to: '2026-10-21', state: 'current' } } }
export const Ahead = { args: { info: { age: 60, week: 1, from: '2050-01-01', to: '2050-01-07', state: 'ahead' } } }
export const TouchReadout = { args: { mode: 'readout', info: { age: 36, week: 42, from: '2026-10-15', to: '2026-10-21', state: 'current' } } }
