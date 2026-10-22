import EventStream from './EventStream.vue'
import { eventsFixture } from '../../../tests/nightwatch-fixtures'

const meta = {
  title: 'Nightwatch/EventStream', component: EventStream,
  decorators: [() => ({ template: '<div class="nw"><story /></div>' })],
}
export default meta

const base = { lines: eventsFixture(14).lines, total: 14, group: 'all' as const, tail: true, hasEarlier: true }
export const Default = { args: base }
export const Errors = { args: { ...base, group: 'errors' as const, lines: base.lines.filter((l) => l.groups.includes('errors')), tail: false } }
export const Empty = { args: { ...base, lines: [], total: 0, hasEarlier: false } }
