import { mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { fixture } from '../../tests/fixtures'
import CalendarGrid from './CalendarGrid.vue'
import WeekTooltip from './WeekTooltip.vue'

const cell = (w: any, r: number, b: number) => w.find(`[data-row="${r}"][data-box="${b}"]`)
async function grid() { return mountSuspended(CalendarGrid, { props: { eager: true, data: fixture() }, attachTo: document.body }) }

describe('WeekTooltip', () => {
  it('shows the Designer text: age and week, date range, state', async () => {
    const w = await mountSuspended(WeekTooltip, { props: { mode: 'pointer', info: { age: 36, week: 42, from: '2026-10-15', to: '2026-10-21', state: 'current' } } })
    expect(w.attributes('role')).toBe('tooltip')
    expect(w.text()).toContain('Age 36 · Week 42 of 52')
    expect(w.text()).toContain('15 Oct 2026 – 21 Oct 2026')
    expect(w.text()).toContain('This week')
  })
  it('the touch readout shows the same text and is hidden from assistive tech (the grid live region announces it)', async () => {
    const w = await mountSuspended(WeekTooltip, { props: { mode: 'readout', info: { age: 0, week: 1, from: '1990-01-01', to: '1990-01-07', state: 'lived' } } })
    expect(w.attributes('role')).toBeUndefined()
    expect(w.attributes('aria-hidden')).toBe('true')
    expect(w.text()).toContain('Lived')
  })
  it('renders nothing when there is no info', async () => {
    expect((await mountSuspended(WeekTooltip, { props: { mode: 'pointer', info: null } })).find('.tip').exists()).toBe(false)
  })
})

describe('keyboard on the grid', () => {
  it('inline puts the tooltip in the page flow', async () => {
    const w = await mountSuspended(WeekTooltip, { props: { mode: 'pointer', inline: true, info: { age: 1, week: 1, from: '1990-01-01', to: '1990-01-07', state: 'lived' } } })
    expect(w.find('.tip').classes()).toContain('inline')
  })
  it('arrow keys move the one tab stop and focus; the box is not described by the tooltip (its aria-label already says it)', async () => {
    const w = await grid()
    const start = cell(w, 36, 41)
    ;(start.element as HTMLElement).focus()
    await start.trigger('keydown', { key: 'ArrowRight' })
    expect(cell(w, 36, 42).attributes('tabindex')).toBe('0')
    expect(start.attributes('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(cell(w, 36, 42).element)
    expect(cell(w, 36, 42).attributes('aria-describedby')).toBeUndefined()
    expect(w.findAll('[tabindex="0"]')).toHaveLength(1)
    w.unmount()
  })
  it('focus shows the tooltip over the box; Escape hides it', async () => {
    const w = await grid()
    const c = cell(w, 10, 5)
    ;(c.element as HTMLElement).focus()
    await c.trigger('focusin')
    expect(document.getElementById('week-tooltip')?.textContent).toContain('Age 10 · Week 6 of 52')
    await c.trigger('keydown', { key: 'Escape' })
    expect(document.getElementById('week-tooltip')).toBeNull()
    w.unmount()
  })
  it('hover with a mouse shows it, leaving hides it; there is one tooltip element only', async () => {
    const w = await grid()
    await cell(w, 36, 41).trigger('pointermove', { pointerType: 'mouse', clientX: 100, clientY: 100 })
    expect(document.querySelectorAll('#week-tooltip')).toHaveLength(1)
    expect(document.getElementById('week-tooltip')?.textContent).toContain('This week')
    await w.find('[role="grid"]').trigger('pointerleave', { pointerType: 'mouse' })
    expect(document.getElementById('week-tooltip')).toBeNull()
    w.unmount()
  })
  it('Escape anywhere in the document dismisses a hover tooltip', async () => {
    const w = await grid()
    await cell(w, 36, 41).trigger('pointermove', { pointerType: 'mouse', clientX: 100, clientY: 100 })
    expect(document.getElementById('week-tooltip')).not.toBeNull()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(document.getElementById('week-tooltip')).toBeNull()
    w.unmount()
  })
  it('focusout to another box inside the grid keeps the tip; focusout to outside hides it', async () => {
    const w = await grid()
    const c = cell(w, 10, 5)
    await c.trigger('pointermove', { pointerType: 'mouse', clientX: 10, clientY: 10 })
    await c.trigger('focusout', { relatedTarget: cell(w, 10, 6).element })
    expect(document.getElementById('week-tooltip')).not.toBeNull()
    await c.trigger('focusout', { relatedTarget: document.body })
    expect(document.getElementById('week-tooltip')).toBeNull()
    w.unmount()
  })
  it('ignores Alt+Arrow, Shift and Ctrl+Arrow so browser shortcuts work', async () => {
    const w = await grid()
    const start = cell(w, 36, 41)
    ;(start.element as HTMLElement).focus()
    await start.trigger('keydown', { key: 'ArrowRight', altKey: true })
    await start.trigger('keydown', { key: 'ArrowRight', shiftKey: true })
    await start.trigger('keydown', { key: 'ArrowRight', ctrlKey: true })
    expect(start.attributes('tabindex')).toBe('0')
    await start.trigger('keydown', { key: 'Home', ctrlKey: true })
    expect(cell(w, 0, 0).attributes('tabindex')).toBe('0')
    w.unmount()
  })
  it('focusing any box (click, programmatic) moves the one tab stop', async () => {
    const w = await grid()
    const c = cell(w, 5, 5)
    ;(c.element as HTMLElement).focus()
    await c.trigger('focusin')
    expect(c.attributes('tabindex')).toBe('0')
    expect(w.findAll('[tabindex="0"]')).toHaveLength(1)
    w.unmount()
  })
})

describe('the grid live region (touch readout)', () => {
  const live = (w: any) => w.find('[data-testid="grid-live"]')
  it('is one persistent polite region, empty until a touch readout shows', async () => {
    const w = await grid()
    const el = live(w).element
    expect(live(w).attributes('aria-live')).toBe('polite')
    expect(live(w).attributes('aria-atomic')).toBe('true')
    expect(live(w).text()).toBe('')
    await cell(w, 36, 41).trigger('pointerup', { pointerType: 'touch', clientX: 1, clientY: 1 })
    expect(live(w).element).toBe(el)   // the same element, so the change is announced
    w.unmount()
  })
  it('keyboard and mouse tooltips do not write to it (focus already reads the aria-label; no double reading)', async () => {
    const w = await grid()
    const c = cell(w, 10, 5)
    ;(c.element as HTMLElement).focus()
    await c.trigger('focusin')
    expect(live(w).text()).toBe('')
    await cell(w, 36, 41).trigger('pointermove', { pointerType: 'mouse', clientX: 100, clientY: 100 })
    expect(live(w).text()).toBe('')
    w.unmount()
  })
})

describe('the single tab stop while rows are pending', () => {
  it('focusing a drawn box before the this-week row is drawn leaves exactly one tab stop once everything is drawn', async () => {
    const w = await mountSuspended(CalendarGrid, { props: { data: fixture() }, attachTo: document.body })   // eager=false: chunks of 10 rows
    const root = document.getElementById('calendar-grid')!
    expect(root.dataset.rendered).toBe('pending')
    expect(root.getAttribute('tabindex')).toBe('0')   // this week (row 36) is not drawn: the grid is the stop
    const box = root.querySelector<HTMLElement>('[data-row="3"][data-box="5"]')!
    box.focus()
    await nextTick()
    await vi.waitFor(() => expect(root.dataset.rendered).toBe('complete'), { timeout: 5000 })
    await nextTick()
    const stops = [root, ...root.querySelectorAll<HTMLElement>('[role="gridcell"]')].filter(e => e.getAttribute('tabindex') === '0')
    expect(stops).toEqual([box])
    w.unmount()
  })
})
