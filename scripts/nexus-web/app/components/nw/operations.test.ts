import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { attentionFixture, overviewFixture } from '../../../tests/nightwatch-fixtures'
import AttentionTable from './AttentionTable.vue'
import LastEvents from './LastEvents.vue'
import PhaseTable from './PhaseTable.vue'
import WorkersTable from './WorkersTable.vue'

const NOW = Date.parse('2026-10-22T03:00:00.000Z')

describe('PhaseTable', () => {
  it('lists the seven phases and states the lock and the window on screen', async () => {
    const o = overviewFixture()
    const w = await mountSuspended(PhaseTable, { props: { rows: o.tickets.rows, lockTicket: 'DGS-590', windowDays: 7, nowMs: NOW } })
    for (const p of ['claimed', 'building', 'review', 'merge-ready', 'merged', 'released', 'lost']) expect(w.text()).toContain(p)
    expect(w.text()).toContain('one claimed ticket at a time (scan lock)')
    expect(w.text()).toContain('window: 7 days')
    expect(w.text()).toContain('DGS-590')
  })
})

describe('WorkersTable', () => {
  it('links each worker to its run and shows tokens as not measured', async () => {
    const w = await mountSuspended(WorkersTable, { props: { workers: overviewFixture().workers, nowMs: NOW } })
    const links = w.findAll('a').map((a) => a.attributes('href'))
    expect(links[0]).toMatch(/^\/nightwatch\/run\/\?id=/)
    expect(w.text()).toContain('stalled')
    expect(w.find('[title="not measured"]').exists()).toBe(true)
  })
  it('says so when no worker runs', async () => {
    const w = await mountSuspended(WorkersTable, { props: { workers: [], nowMs: NOW } })
    expect(w.text()).toContain('No worker is running.')
  })
})

describe('LastEvents', () => {
  it('shows UTC+7 times and an empty line', async () => {
    const w = await mountSuspended(LastEvents, { props: { events: overviewFixture().lastEvents } })
    expect(w.text()).toMatch(/\d\d:\d\d/)
    const e = await mountSuspended(LastEvents, { props: { events: [] } })
    expect(e.text()).toContain('No events yet.')
  })
})

describe('AttentionTable', () => {
  it('lists open items with age, kind and cause, and has no button', async () => {
    const a = attentionFixture()
    const w = await mountSuspended(AttentionTable, { props: { open: a.open, resolved: a.resolved, nowMs: NOW } })
    expect(w.text()).toContain('Waiting on Jack')
    expect(w.text()).toContain(a.open[0]!.cause)
    expect(w.find('button').exists()).toBe(false)
  })
  it('empty says nothing waits', async () => {
    const w = await mountSuspended(AttentionTable, { props: { open: [], resolved: [], nowMs: NOW } })
    expect(w.text()).toContain('Nothing waits for you.')
  })
})
