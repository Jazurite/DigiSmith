import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { attentionFixture, overviewFixture } from '../../../tests/oculus-fixtures'
import AttentionTable from './AttentionTable.vue'
import LastEvents from './LastEvents.vue'
import PhaseTable from './PhaseTable.vue'
import ScanCard from './ScanCard.vue'
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
  it('counts elapsed from the start for a running worker and freezes an ended one', async () => {
    const [run] = overviewFixture().workers
    const ended = { ...run!, run: 'x-ended', endedAt: '2026-10-22T02:20:00.000Z', elapsedSec: 600 }
    const w = await mountSuspended(WorkersTable, { props: { workers: [run!, ended], nowMs: NOW } })
    const rows = w.findAll('tbody tr').map((r) => r.text())
    expect(rows[0]).toContain('0:50:00')   // 02:10 to 03:00
    expect(rows[1]).toContain('0:10:00')
  })
  it('says so when no worker runs', async () => {
    const w = await mountSuspended(WorkersTable, { props: { workers: [], nowMs: NOW } })
    expect(w.text()).toContain('No worker is running.')
  })
})

describe('ScanCard', () => {
  it('shows the last scan, lock and a closed breaker', async () => {
    const w = await mountSuspended(ScanCard, { props: { scan: overviewFixture().scan, lockTicket: 'DGS-590' } })
    expect(w.text()).toContain('away')
    expect(w.text()).toContain('DGS-590')
    expect(w.text()).toContain('closed (streak 0)')
  })
  it('shows an open breaker and no scan yet', async () => {
    const scan = { ...overviewFixture().scan, away: false, breakerOpen: true, breakerStreak: 3, lastScanAt: null, candidates: null }
    const w = await mountSuspended(ScanCard, { props: { scan, lockTicket: null } })
    expect(w.text()).toContain('open (streak 3)')
    expect(w.text()).toContain('No scan yet')
    expect(w.text()).toContain('none')
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
    const first = w.findAll('tbody tr')[0]!.text()
    expect(first).toContain('1h28m')   // age of att-1 at NOW
    expect(first).toContain('lost')
    expect(w.text()).toContain('DGS-586')
    expect(w.text()).toContain('resolved by watchdog: tool seen')
    const resolvedHeads = w.findAll('table')[1]!.findAll('th').map((h) => h.text())
    expect(resolvedHeads).toEqual(['Time (UTC+7)', 'Ticket', 'Kind', 'Resolution'])
    expect(w.find('button').exists()).toBe(false)
  })
  it('shows the resolve command of each open item as copy text, never as a button', async () => {
    const a = attentionFixture()
    const w = await mountSuspended(AttentionTable, { props: { open: a.open, resolved: a.resolved, nowMs: NOW } })
    const cmds = w.findAll('tbody tr').slice(0, a.open.length).map((r) => r.find('code.cmd').text())
    expect(cmds).toEqual(a.open.map((o) => `dg autonomous attention resolve ${o.id}`))
    expect(w.find('button').exists()).toBe(false)
  })
  it('empty says nothing waits', async () => {
    const w = await mountSuspended(AttentionTable, { props: { open: [], resolved: [], nowMs: NOW } })
    expect(w.text()).toContain('Nothing waits for you.')
  })
})
