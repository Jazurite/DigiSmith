import { mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import { attentionFixture, eventsFixture, overviewFixture, planFixture, runsFixture } from '../../../tests/nightwatch-fixtures'
import AttentionTable from './AttentionTable.vue'
import EventStream from './EventStream.vue'
import LastEvents from './LastEvents.vue'
import NwStaleBanner from './NwStaleBanner.vue'
import PhaseTable from './PhaseTable.vue'
import PlanTasks from './PlanTasks.vue'
import RunsTable from './RunsTable.vue'
import VerdictTable from './VerdictTable.vue'
import WorkersTable from './WorkersTable.vue'

const NOW = Date.parse('2026-10-22T03:00:00.000Z')

describe('row cards on mobile: every cell carries its column name', () => {
  const heads = (w: { findAll: (s: string) => { text: () => string }[] }) => w.findAll('thead th').map((h) => h.text())
  const check = async (comp: object, props: object) => {
    const w = await mountSuspended(comp, { props })
    for (const table of w.findAll('table')) {
      const names = table.findAll('thead th').map((h) => h.text())
      const rows = table.findAll('tbody tr')
      expect(rows.length).toBeGreaterThan(0)
      for (const r of rows) expect(r.findAll('td').map((c) => c.attributes('data-label'))).toEqual(names)
    }
  }
  const o = overviewFixture(); const a = attentionFixture()
  it('runs, workers, phases, last events, attention, verdicts, plan tasks, events', async () => {
    void heads
    await check(RunsTable, { runs: runsFixture().runs, nowMs: NOW })
    await check(WorkersTable, { workers: o.workers, nowMs: NOW })
    await check(PhaseTable, { rows: o.tickets.rows, nowMs: NOW })
    await check(LastEvents, { events: o.lastEvents })
    await check(AttentionTable, { open: a.open, resolved: a.resolved, nowMs: NOW })
    await check(VerdictTable, { verdicts: planFixture().verdicts, ledgerError: false })
    await check(PlanTasks, { plan: planFixture() })
    await check(EventStream, { lines: eventsFixture(5).lines, total: 5, group: 'all', tail: true, hasEarlier: false })
  })
})

describe('NwStaleBanner', () => {
  it('shows the time of the failed update in UTC+7 and no error code', async () => {
    const w = await mountSuspended(NwStaleBanner, { props: { failedAt: Date.parse('2026-10-22T03:41:09.000Z') } })
    expect(w.text()).toContain('last update failed at 10:41 (UTC+7)')
    expect(w.text()).not.toMatch(/\b(50\d|40\d)\b|reader_unavailable|internal_invalid/)
  })
  it('without a time it still says the update failed', async () => {
    expect((await mountSuspended(NwStaleBanner)).text()).toContain('The last update failed')
  })
})

describe('EventStream sticks to the bottom until the user scrolls up', () => {
  const mount = async (n: number) => mountSuspended(EventStream, { props: { lines: eventsFixture(n).lines, total: n, group: 'all', tail: true, hasEarlier: false } })
  const fake = (el: HTMLElement) => {
    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => 1000 })
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 400 })
  }
  it('follows new lines while at the bottom, stays put after a scroll up', async () => {
    const w = await mount(5)
    const box = w.find('[data-stream]').element as HTMLElement
    fake(box)
    box.scrollTop = 600   // at the bottom: 600 + 400 = 1000
    await box.dispatchEvent(new Event('scroll'))
    await w.setProps({ lines: eventsFixture(8).lines })
    await nextTick()
    expect(box.scrollTop).toBe(1000)
    box.scrollTop = 100   // the user scrolled up
    await box.dispatchEvent(new Event('scroll'))
    await w.setProps({ lines: eventsFixture(11).lines })
    await nextTick()
    expect(box.scrollTop).toBe(100)
    expect(box.getAttribute('tabindex')).toBe('0')
    expect(box.getAttribute('role')).toBe('region')
  })
})
