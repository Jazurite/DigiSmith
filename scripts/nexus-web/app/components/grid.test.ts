import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { BEFORE_BIRTH, fixture, PAST_LAST_ROW } from '../../tests/fixtures'
import CalendarGrid from './CalendarGrid.vue'

describe('CalendarGrid', () => {
  it('draws 90 rows of 52 boxes with the right states', async () => {
    const w = await mountSuspended(CalendarGrid, { props: { data: fixture() } })
    expect(w.findAll('[role="row"]')).toHaveLength(91)   // 90 years + the ruler row
    expect(w.findAll('[role="gridcell"]')).toHaveLength(4680)
    expect(w.findAll('[data-state="lived"]')).toHaveLength(1913)
    expect(w.findAll('[data-state="current"]')).toHaveLength(1)
    expect(w.findAll('[data-state="ahead"]')).toHaveLength(2766)
  })
  it('names every box, with the full date range', async () => {
    const w = await mountSuspended(CalendarGrid, { props: { data: fixture() } })
    expect(w.find('[data-row="36"][data-box="41"]').attributes('aria-label')).toBe('Age 36, week 42 of 52, 15 October 2026 to 21 October 2026, this week')
    expect(w.find('[data-row="0"][data-box="0"]').attributes('aria-label')).toBe('Age 0, week 1 of 52, 1 January 1990 to 7 January 1990, lived')
    expect(w.find('[data-row="36"][data-box="51"]').attributes('aria-label')).toBe('Age 36, week 52 of 52, 24 December 2026 to 31 December 2026, ahead')
    expect(w.findAll('[role="gridcell"]').every(c => !!c.attributes('aria-label'))).toBe(true)
  })
  it('is a grid with a name, row headers and column headers', async () => {
    const w = await mountSuspended(CalendarGrid, { props: { data: fixture() } })
    const grid = w.find('[role="grid"]')
    expect(grid.attributes('id')).toBe('calendar-grid')
    expect(grid.attributes('aria-label')).toMatch(/arrow keys/i)
    expect(w.findAll('[role="rowheader"]')).toHaveLength(90)
    expect(w.findAll('[role="columnheader"]').map(h => h.text())).toEqual(['Age', 'Week 1', 'Week 13', 'Week 26', 'Week 39', 'Week 52'])
  })
  it('shows a visible age only every 10 rows, and all rows keep a hidden name', async () => {
    const w = await mountSuspended(CalendarGrid, { props: { data: fixture() } })
    expect(w.findAll('.age.labelled').map(a => a.find('[aria-hidden="true"]').text())).toEqual(['0', '10', '20', '30', '40', '50', '60', '70', '80'])
    expect(w.findAll('[role="rowheader"]')[36]!.find('.sr-only').text()).toBe('Age 36')
  })
  it('ends a decade with extra space: 8 gaps between 90 rows', async () => {
    const w = await mountSuspended(CalendarGrid, { props: { data: fixture() } })
    expect(w.findAll('.row.decade-end')).toHaveLength(8)
  })
  it('exactly one tab stop: this week, or the first box when there is none', async () => {
    const now = await mountSuspended(CalendarGrid, { props: { data: fixture() } })
    expect(now.findAll('[tabindex="0"]').map(e => [e.attributes('data-row'), e.attributes('data-box')])).toEqual([['36', '41']])
    for (const data of [BEFORE_BIRTH(), PAST_LAST_ROW()]) {
      const w = await mountSuspended(CalendarGrid, { props: { data } })
      expect(w.findAll('[tabindex="0"]').map(e => [e.attributes('data-row'), e.attributes('data-box')])).toEqual([['0', '0']])
      expect(w.findAll('[data-state="current"]')).toHaveLength(0)
    }
  })
  it('before birth: all ahead. past the last row: all lived', async () => {
    expect((await mountSuspended(CalendarGrid, { props: { data: BEFORE_BIRTH() } })).findAll('[data-state="ahead"]')).toHaveLength(4680)
    expect((await mountSuspended(CalendarGrid, { props: { data: PAST_LAST_ROW() } })).findAll('[data-state="lived"]')).toHaveLength(4680)
  })
})
