import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { fixture } from '../../tests/fixtures'
import CalendarGrid from './CalendarGrid.vue'
import WeekTooltip from './WeekTooltip.vue'

const cell = (w: any, r: number, b: number) => w.find(`[data-row="${r}"][data-box="${b}"]`)
async function grid() { return mountSuspended(CalendarGrid, { props: { data: fixture() }, attachTo: document.body }) }

describe('WeekTooltip', () => {
  it('shows the Designer text: age and week, date range, state', async () => {
    const w = await mountSuspended(WeekTooltip, { props: { mode: 'pointer', info: { age: 36, week: 42, from: '2026-10-15', to: '2026-10-21', state: 'current' } } })
    expect(w.attributes('role')).toBe('tooltip')
    expect(w.text()).toContain('Age 36 · Week 42 of 52')
    expect(w.text()).toContain('15 Oct 2026 – 21 Oct 2026')
    expect(w.text()).toContain('This week')
  })
  it('the touch readout is a status region and shows the same text', async () => {
    const w = await mountSuspended(WeekTooltip, { props: { mode: 'readout', info: { age: 0, week: 1, from: '1990-01-01', to: '1990-01-07', state: 'lived' } } })
    expect(w.attributes('role')).toBe('status')
    expect(w.text()).toContain('Lived')
  })
  it('renders nothing when there is no info', async () => {
    expect((await mountSuspended(WeekTooltip, { props: { mode: 'pointer', info: null } })).find('.tip').exists()).toBe(false)
  })
})

describe('keyboard on the grid', () => {
  it('arrow keys move the one tab stop and focus, and describe the box by the tooltip', async () => {
    const w = await grid()
    const start = cell(w, 36, 41)
    ;(start.element as HTMLElement).focus()
    await start.trigger('keydown', { key: 'ArrowRight' })
    expect(cell(w, 36, 42).attributes('tabindex')).toBe('0')
    expect(start.attributes('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(cell(w, 36, 42).element)
    expect(cell(w, 36, 42).attributes('aria-describedby')).toBe('week-tooltip')
    expect(w.findAll('[tabindex="0"]')).toHaveLength(1)
    w.unmount()
  })
  it('focus shows the tooltip over the box; Escape hides it and removes aria-describedby', async () => {
    const w = await grid()
    const c = cell(w, 10, 5)
    ;(c.element as HTMLElement).focus()
    await c.trigger('focusin')
    expect(document.getElementById('week-tooltip')?.textContent).toContain('Age 10 · Week 6 of 52')
    await c.trigger('keydown', { key: 'Escape' })
    expect(document.getElementById('week-tooltip')).toBeNull()
    expect(c.attributes('aria-describedby')).toBeUndefined()
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
})
