import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { BEFORE_BIRTH, fixture, PAST_LAST_ROW } from '../../tests/fixtures'
import CalendarLegend from './CalendarLegend.vue'
import GridSkeleton from './GridSkeleton.vue'
import LifeCalendarView from './LifeCalendarView.vue'
import StatsBar from './StatsBar.vue'

describe('StatsBar', () => {
  it('shows the three numbers with separators and one decimal (pending Jack: the labels)', async () => {
    const w = await mountSuspended(StatsBar, { props: { totals: fixture().totals, loading: false } })
    expect(w.findAll('dt').map(e => e.text())).toEqual(['weeks lived', 'weeks left', 'lived'])
    expect(w.findAll('dd').map(e => e.text())).toEqual(['1,913', '2,766', '40.9%'])
  })
  it('edge cases keep the layout: 0 / 4,680 / 0.0% and 4,680 / 0 / 100.0%', async () => {
    expect((await mountSuspended(StatsBar, { props: { totals: BEFORE_BIRTH().totals, loading: false } })).findAll('dd').map(e => e.text())).toEqual(['0', '4,680', '0.0%'])
    expect((await mountSuspended(StatsBar, { props: { totals: PAST_LAST_ROW().totals, loading: false } })).findAll('dd').map(e => e.text())).toEqual(['4,680', '0', '100.0%'])
  })
  it('loading: bars, aria-busy and a polite live region; no numbers', async () => {
    const w = await mountSuspended(StatsBar, { props: { totals: null, loading: true } })
    expect(w.find('[aria-live="polite"]').attributes('aria-busy')).toBe('true')
    expect(w.findAll('.bar')).toHaveLength(3)
  })
  it('error forms show a dash', async () => {
    const w = await mountSuspended(StatsBar, { props: { totals: null, loading: false } })
    expect(w.findAll('dd').map(e => e.text())).toEqual(['–', '–', '–'])
  })
})

describe('CalendarLegend and GridSkeleton', () => {
  it('the legend names the three states in words', async () => {
    expect((await mountSuspended(CalendarLegend)).text()).toMatch(/Lived\s*This week\s*Ahead/)
  })
  it('the skeleton has one element per row, no per-box nodes, and is hidden from assistive technology', async () => {
    const w = await mountSuspended(GridSkeleton, { props: { rows: 90, ghost: false } })
    expect(w.attributes('aria-hidden')).toBe('true')
    expect(w.findAll('.srow')).toHaveLength(90)
    expect(w.findAll('[role="gridcell"]')).toHaveLength(0)
  })
})

describe('LifeCalendarView states keep the frame', () => {
  it('loaded: stats, legend, grid and the note', async () => {
    const w = await mountSuspended(LifeCalendarView, { props: { state: { kind: 'loaded', data: fixture() }, retrying: false } })
    expect(w.findAll('dd').map(e => e.text())).toEqual(['1,913', '2,766', '40.9%'])
    expect(w.find('[role="grid"]').exists()).toBe(true)
    expect(w.text()).toContain('Weeks count from each birthday.')
  })
  it('loading: skeleton and busy stats, no grid', async () => {
    const w = await mountSuspended(LifeCalendarView, { props: { state: { kind: 'loading' }, retrying: false } })
    expect(w.find('.skeleton').exists()).toBe(true)
    expect(w.find('[role="grid"]').exists()).toBe(false)
    expect(w.find('[aria-busy="true"]').exists()).toBe(true)
  })
  it('error, locked and empty: dashes, a ghost grid and a panel on top', async () => {
    for (const kind of ['error', 'locked', 'empty'] as const) {
      const w = await mountSuspended(LifeCalendarView, { props: { state: { kind }, retrying: false } })
      expect(w.findAll('dd').map(e => e.text())).toEqual(['–', '–', '–'])
      expect(w.find('.skeleton.ghost').exists()).toBe(true)
      expect(w.find('.panel').exists()).toBe(true)
    }
  })
})
