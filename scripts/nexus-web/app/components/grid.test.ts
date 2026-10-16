import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import { BEFORE_BIRTH, fixture, PAST_LAST_ROW } from '../../tests/fixtures'
import CalendarGrid from './CalendarGrid.vue'

describe('CalendarGrid', () => {
  it('draws 90 rows of 52 boxes with the right states', async () => {
    const w = await mountSuspended(CalendarGrid, { props: { eager: true, data: fixture() } })
    expect(w.findAll('[role="row"]')).toHaveLength(91)   // 90 years + the ruler row
    expect(w.findAll('[role="gridcell"]')).toHaveLength(4680)
    expect(w.findAll('[data-state="lived"]')).toHaveLength(1913)
    expect(w.findAll('[data-state="current"]')).toHaveLength(1)
    expect(w.findAll('[data-state="ahead"]')).toHaveLength(2766)
  })
  it('names every box, with the full date range', async () => {
    const w = await mountSuspended(CalendarGrid, { props: { eager: true, data: fixture() } })
    expect(w.find('[data-row="36"][data-box="41"]').attributes('aria-label')).toBe('Age 36, week 42 of 52, 15 October 2026 to 21 October 2026, this week')
    expect(w.find('[data-row="0"][data-box="0"]').attributes('aria-label')).toBe('Age 0, week 1 of 52, 1 January 1990 to 7 January 1990, lived')
    expect(w.find('[data-row="36"][data-box="51"]').attributes('aria-label')).toBe('Age 36, week 52 of 52, 24 December 2026 to 31 December 2026, ahead')
    expect(w.findAll('[role="gridcell"]').every(c => !!c.attributes('aria-label'))).toBe(true)
  })
  it('is a grid with a name, row headers and column headers', async () => {
    const w = await mountSuspended(CalendarGrid, { props: { eager: true, data: fixture() } })
    const grid = w.find('[role="grid"]')
    expect(grid.attributes('id')).toBe('calendar-grid')
    expect(grid.attributes('aria-label')).toMatch(/arrow keys/i)
    expect(w.findAll('[role="rowheader"]')).toHaveLength(90)
    expect(w.findAll('[role="columnheader"]').map(h => h.text())).toEqual(['Age', 'Week 1', 'Week 13', 'Week 26', 'Week 39', 'Week 52'])
  })
  it('shows a visible age only every 10 rows, and all rows keep a hidden name', async () => {
    const w = await mountSuspended(CalendarGrid, { props: { eager: true, data: fixture() } })
    expect(w.findAll('.age.labelled').map(a => a.find('[aria-hidden="true"]').text())).toEqual(['0', '10', '20', '30', '40', '50', '60', '70', '80'])
    expect(w.findAll('[role="rowheader"]')[36]!.find('.sr-only').text()).toBe('Age 36')
  })
  it('ends a decade with extra space: 8 gaps between 90 rows', async () => {
    const w = await mountSuspended(CalendarGrid, { props: { eager: true, data: fixture() } })
    expect(w.findAll('.row.decade-end')).toHaveLength(8)
  })
  it('exactly one tab stop: this week, or the first box when there is none', async () => {
    const now = await mountSuspended(CalendarGrid, { props: { eager: true, data: fixture() } })
    expect(now.findAll('[tabindex="0"]').map(e => [e.attributes('data-row'), e.attributes('data-box')])).toEqual([['36', '41']])
    for (const data of [BEFORE_BIRTH(), PAST_LAST_ROW()]) {
      const w = await mountSuspended(CalendarGrid, { props: { eager: true, data } })
      expect(w.findAll('[tabindex="0"]').map(e => [e.attributes('data-row'), e.attributes('data-box')])).toEqual([['0', '0']])
      expect(w.findAll('[data-state="current"]')).toHaveLength(0)
    }
  })
  it('before birth: all ahead. past the last row: all lived', async () => {
    expect((await mountSuspended(CalendarGrid, { props: { eager: true, data: BEFORE_BIRTH() } })).findAll('[data-state="ahead"]')).toHaveLength(4680)
    expect((await mountSuspended(CalendarGrid, { props: { eager: true, data: PAST_LAST_ROW() } })).findAll('[data-state="lived"]')).toHaveLength(4680)
  })
  it('gives the ruler headers their real column index, so the week marks are not mapped by position', async () => {
    const w = await mountSuspended(CalendarGrid, { props: { eager: true, data: fixture() } })
    expect(w.findAll('[role="columnheader"]').map(h => h.attributes('aria-colindex'))).toEqual(['1', '2', '14', '27', '40', '47'])
  })
  it('keeps every ruler mark inside the grid: the last one is right-aligned and ends at the last column', async () => {
    const w = await mountSuspended(CalendarGrid, { props: { eager: true, data: fixture() } })
    const marks = w.findAll('.mark')
    expect(marks.at(-1)!.classes()).toContain('last')
    expect(marks.at(-1)!.attributes('style')).toContain('grid-column: 47 / 54')
    expect(marks.map(m => m.attributes('style')).every(st => /grid-column: \d+ \/ (span 7|54)/.test(st ?? ''))).toBe(true)
  })
  it('draws the first 10 rows at once, reserves the rest, and ends with the same grid', async () => {
    const w = await mountSuspended(CalendarGrid, { props: { data: fixture() }, attachTo: document.body })
    const grid = () => w.find('#calendar-grid')
    expect(grid().attributes('data-rendered')).toBe('pending')
    expect(w.findAll('[role="gridcell"]').length).toBeLessThan(4680)
    expect(w.find('.pending').exists()).toBe(true)
    expect(grid().attributes('tabindex')).toBe('0')   // the grid is the tab stop until the real one exists
    await vi.waitFor(() => expect(grid().attributes('data-rendered')).toBe('complete'), { timeout: 5000 })
    expect(w.findAll('[role="gridcell"]')).toHaveLength(4680)
    expect(w.findAll('[role="row"]')).toHaveLength(91)
    expect(w.find('.pending').exists()).toBe(false)
    expect(grid().attributes('tabindex')).toBeUndefined()
    expect(w.findAll('[tabindex="0"]').map(e => [e.attributes('data-row'), e.attributes('data-box')])).toEqual([['36', '41']])
    w.unmount()
  })
  it('focusing the grid while rows are pending draws everything and moves the focus to this week', async () => {
    const w = await mountSuspended(CalendarGrid, { props: { data: fixture() }, attachTo: document.body })
    ;(w.find('#calendar-grid').element as HTMLElement).focus()
    await vi.waitFor(() => expect(document.activeElement?.getAttribute('data-row')).toBe('36'))
    expect(w.find('#calendar-grid').attributes('data-rendered')).toBe('complete')
    w.unmount()
  })
})
