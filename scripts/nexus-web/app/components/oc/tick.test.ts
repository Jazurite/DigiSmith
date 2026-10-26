// scripts/nexus-web/app/components/oc/tick.test.ts
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h, nextTick, provide, ref } from 'vue'
import type { Component } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { runFixture, runDetailFixture, runsFixture, overviewFixture } from '../../../tests/oculus-fixtures'
import { NOW_KEY } from '../../utils/use-now'
import OcTick from './OcTick.vue'
import RunsTable from './RunsTable.vue'
import WorkersTable from './WorkersTable.vue'
import PipelineBar from './PipelineBar.vue'
import BudgetCard from './BudgetCard.vue'

const T0 = Date.parse('2026-10-22T03:00:00Z')
// a host that provides the page clock and renders one child; it counts its own renders
const host = (child: Component, props: Record<string, unknown>) => {
  const now = ref(T0)
  const renders = { n: 0 }
  const Host = defineComponent({ setup() { provide(NOW_KEY, now); return () => { renders.n++; return h(child, props) } } })
  return { Host, now, renders }
}

describe('OcTick', () => {
  it('passes the injected clock to its slot', async () => {
    const now = ref(T0)
    const Host = defineComponent({ setup() { provide(NOW_KEY, now); return () => h(OcTick, null, { default: ({ nowMs }: { nowMs: number }) => String(nowMs) }) } })
    const w = await mountSuspended(Host)
    expect(w.text()).toBe(String(T0))
    now.value += 1000
    await nextTick()
    expect(w.text()).toBe(String(T0 + 1000))
  })
  it('uses the nowMs prop and ignores the clock', async () => {
    const now = ref(T0)
    const Host = defineComponent({ setup() { provide(NOW_KEY, now); return () => h(OcTick, { nowMs: 5 }, { default: ({ nowMs }: { nowMs: number }) => String(nowMs) }) } })
    const w = await mountSuspended(Host)
    now.value += 1000
    await nextTick()
    expect(w.text()).toBe('5')
  })
})

describe('tables and cards', () => {
  const dur = (w: { find: (s: string) => { text: () => string } }) => w.find('tbody tr:first-child td[data-label="Duration"] [aria-hidden="true"]').text()
  it('RunsTable: a tick changes the Duration text and does not update the table', async () => {
    const spy = vi.fn()
    const { Host, now, renders } = host(RunsTable, { runs: runsFixture().runs, onVnodeUpdated: spy })
    const w = await mountSuspended(Host)
    expect(dur(w)).toBe('0:50:00 · building 0:14')
    now.value += 1000
    await nextTick()
    expect(dur(w)).toBe('0:50:01 · building 0:14')
    now.value += 59_000
    await nextTick()
    expect(dur(w)).toBe('0:51:00 · building 0:15')
    expect(spy).not.toHaveBeenCalled()
    expect(renders.n).toBe(1)
  })
  it('RunsTable: an ended row has no OcTick and keeps its frozen time', async () => {
    const runs = [runFixture({ state: 'ended', phase: null, phaseSince: null, endedAt: '2026-10-22T02:40:00.000Z', elapsedSec: 1800 })]
    const { Host, now } = host(RunsTable, { runs })
    const w = await mountSuspended(Host)
    expect(w.findComponent(OcTick).exists()).toBe(false)
    expect(dur(w)).toBe('0:30:00')
    now.value += 5000
    await nextTick()
    expect(dur(w)).toBe('0:30:00')
  })
  it('RunsTable with a nowMs prop is frozen', async () => {
    const w = await mountSuspended(RunsTable, { props: { runs: runsFixture().runs, nowMs: T0 } })
    expect(dur(w)).toBe('0:50:00 · building 0:14')
  })
  it('WorkersTable: Elapsed counts with the clock', async () => {
    const { Host, now } = host(WorkersTable, { workers: overviewFixture().workers })
    const w = await mountSuspended(Host)
    const el = () => w.find('tbody tr:first-child td[data-label="Elapsed"]').text()
    expect(el()).toBe('0:50:00')
    now.value += 2000
    await nextTick()
    expect(el()).toBe('0:50:02')
  })
  it('PipelineBar: only the current step ticks', async () => {
    const { Host, now } = host(PipelineBar, { steps: runDetailFixture().pipeline })
    const w = await mountSuspended(Host)
    const items = () => w.findAll('li')
    expect(items()[2]!.find('.dur').text()).toBe('0:50')
    const doneBefore = items()[0]!.find('.dur').text()
    now.value += 60_000
    await nextTick()
    expect(items()[2]!.find('.dur').text()).toBe('0:51')
    expect(items()[2]!.find('.sr').text()).toBe('(current, 51 min so far)')
    expect(items()[0]!.find('.dur').text()).toBe(doneBefore)
  })
  it('BudgetCard: the minutes follow the clock when phaseSince is given', async () => {
    const budget = { ...runDetailFixture().budget, phase: 'building' as const, limitMin: 45, elapsedMin: 41 }
    const { Host, now } = host(BudgetCard, { budget, phaseSince: '2026-10-22T02:19:00.000Z' })
    const w = await mountSuspended(Host)
    expect(w.text()).toContain('building 0:41 of 45 min')
    now.value += 4 * 60_000
    await nextTick()
    expect(w.text()).toContain('building 0:45 of 45 min')
    expect(w.find('.track i').attributes('style')).toContain('width: 100%')
    expect(w.text()).not.toContain('(over budget)')
    now.value += 60_000
    await nextTick()
    expect(w.text()).toContain('(over budget)')
    const h2 = host(BudgetCard, { budget })
    const w2 = await mountSuspended(h2.Host)
    h2.now.value += 10 * 60_000
    await nextTick()
    expect(w2.text()).toContain('building 0:41 of 45 min')
  })
  it('no live region in the cells', async () => {
    const mounts = [
      await mountSuspended(RunsTable, { props: { runs: runsFixture().runs } }),
      await mountSuspended(PipelineBar, { props: { steps: runDetailFixture().pipeline } }),
      await mountSuspended(BudgetCard, { props: { budget: runDetailFixture().budget, phaseSince: '2026-10-22T02:46:00.000Z' } }),
    ]
    for (const w of mounts) expect(w.find('[aria-live], [role="status"], [role="timer"]').exists()).toBe(false)
  })
})
