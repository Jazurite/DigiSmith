import { flushPromises } from '@vue/test-utils'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { reactive, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attentionFixture, eventsFixture, overviewFixture, planFixture, runDetailFixture, runFixture, runsFixture } from '../../../tests/oculus-fixtures'
import { OculusApiError } from '../../composables/oculus-api'
import Attention from './attention.vue'
import Plan from './plan.vue'
import Run from './run.vue'
import Runs from './runs.vue'

const api = vi.hoisted(() => ({ loadAttention: vi.fn(), loadRuns: vi.fn(), loadRun: vi.fn(), loadEvents: vi.fn(), loadPlan: vi.fn() }))
vi.mock('../../composables/oculus-api', async (orig) => ({ ...(await orig<typeof import('../../composables/oculus-api')>()), ...api }))
const holder = vi.hoisted(() => ({ route: null as unknown as { query: Record<string, string> } }))
const route = reactive({ query: {} as Record<string, string> })
holder.route = route
mockNuxtImport('useRoute', () => () => holder.route)
const nav = vi.hoisted(() => vi.fn())
mockNuxtImport('navigateTo', () => nav)

const provide = (overview: ReturnType<typeof overviewFixture> | null, stale = false) => ({
  ocOverview: { overview: ref(overview), stale: ref(stale), updatedAt: ref(null), failedAt: ref(null), attention: ref(0), refresh: vi.fn() },
})

beforeEach(() => { route.query = {}; Object.values(api).forEach((f) => f.mockReset()); nav.mockReset() })
afterEach(() => { vi.useRealTimers() })

describe('Runs page', () => {
  it('sends only valid filters from the URL to the API and shows the table', async () => {
    route.query = { state: 'lost', role: 'nope', trigger: 'away', ticket: 'DGS-1' }
    api.loadRuns.mockResolvedValue(runsFixture())
    const w = await mountSuspended(Runs)
    await flushPromises()
    expect(api.loadRuns).toHaveBeenCalledWith({ state: 'lost', role: '', trigger: 'away', project: '', ticket: 'DGS-1', limit: 100 })
    expect(w.findAll('tbody tr')).toHaveLength(runsFixture().runs.length)
    w.unmount()
  })
  it('sends a valid project from the URL and drops an unsafe one', async () => {
    api.loadRuns.mockResolvedValue(runsFixture())
    route.query = { project: 'DigiSmith' }
    const w = await mountSuspended(Runs)
    await flushPromises()
    expect(api.loadRuns).toHaveBeenCalledWith(expect.objectContaining({ project: 'DigiSmith' }))
    w.unmount()
    api.loadRuns.mockClear()
    route.query = { project: '../x' }
    const w2 = await mountSuspended(Runs)
    await flushPromises()
    expect(api.loadRuns).toHaveBeenCalledWith(expect.objectContaining({ project: '' }))
    w2.unmount()
  })
  it('writes a chosen project into the URL query', async () => {
    api.loadRuns.mockResolvedValue({ ...runsFixture(), runs: [runFixture({ project: 'emma-theme' })] })
    const w = await mountSuspended(Runs)
    await flushPromises()
    await w.find('[aria-label="Project"]').setValue('emma-theme')
    expect(nav).toHaveBeenCalledWith({ query: { project: 'emma-theme' } }, { replace: true })
    w.unmount()
  })
  it('says No run matches. with a filter and No run yet. without', async () => {
    api.loadRuns.mockResolvedValue({ ...runsFixture(), total: 0, runs: [] })
    const none = await mountSuspended(Runs)
    await flushPromises()
    expect(none.text()).toContain('No run yet.')
    none.unmount()
    route.query = { role: 'scout' }
    const filtered = await mountSuspended(Runs)
    await flushPromises()
    expect(filtered.text()).toContain('No run matches.')
    expect(filtered.text()).not.toContain('No run yet.')
    filtered.unmount()
  })
  it('writes a filter change into the URL query and drops empty values', async () => {
    api.loadRuns.mockResolvedValue(runsFixture())
    const w = await mountSuspended(Runs)
    await flushPromises()
    await w.find('[aria-label="Role"]').setValue('builder')
    expect(nav).toHaveBeenCalledWith({ query: { role: 'builder' } }, { replace: true })
    w.unmount()
  })
  it('shows the error panel when the first load fails and keeps old rows with a banner when a later one fails', async () => {
    api.loadRuns.mockRejectedValue(new Error('x'))
    const bad = await mountSuspended(Runs)
    await flushPromises()
    expect(bad.find('[role="alert"]').exists()).toBe(true)
    bad.unmount()
    vi.useFakeTimers()
    api.loadRuns.mockReset().mockResolvedValueOnce(runsFixture()).mockRejectedValue(new Error('x'))
    const w = await mountSuspended(Runs)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(w.findAll('tbody tr')).toHaveLength(runsFixture().runs.length)
    expect(w.text()).toContain('The last update failed')
    w.unmount()
  })
  const firstDuration = (w: { find: (s: string) => { text: () => string } }): string => w.find('tbody tr:first-child td[data-label="Duration"] [aria-hidden="true"]').text()
  it('the clock ticks every second while a shown run is running', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-22T03:00:00.000Z'))
    api.loadRuns.mockResolvedValue(runsFixture())
    const w = await mountSuspended(Runs)
    await vi.advanceTimersByTimeAsync(0)
    const before = firstDuration(w)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(firstDuration(w)).not.toBe(before)
    expect(firstDuration(w)).toContain('0:50:0')
    w.unmount()
  })
  it('the clock stays at 30 s when no shown run is running', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-22T03:00:00.000Z'))
    api.loadRuns.mockResolvedValue({ ...runsFixture(), runs: [runFixture({ state: 'lost', phase: null, phaseSince: null, endedAt: null }), runFixture({ run: 'x-2', state: 'ended', phase: null, phaseSince: null, endedAt: '2026-10-22T02:40:00.000Z' })] })
    const w = await mountSuspended(Runs)
    await vi.advanceTimersByTimeAsync(0)
    const before = firstDuration(w)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(firstDuration(w)).toBe(before)
    await vi.advanceTimersByTimeAsync(28_000)
    expect(firstDuration(w)).not.toBe(before)
    w.unmount()
  })
})

describe('Run page', () => {
  it('shows This run does not exist. for a missing or unsafe id and calls nothing', async () => {
    for (const q of [{}, { id: '../x' }, { id: 'a/b' }] as Record<string, string>[]) {
      route.query = q
      const w = await mountSuspended(Run)
      await flushPromises()
      expect(w.text()).toContain('This run does not exist.')
      w.unmount()
    }
    expect(api.loadRun).not.toHaveBeenCalled()
    expect(api.loadEvents).not.toHaveBeenCalled()
  })
  it('shows the status, pipeline, stream, budget, record and order of a run', async () => {
    route.query = { id: 'b-1' }
    api.loadRun.mockResolvedValue(runDetailFixture())
    api.loadEvents.mockResolvedValue(eventsFixture(5))
    const w = await mountSuspended(Run)
    await flushPromises()
    expect(api.loadRun).toHaveBeenCalledWith('b-1')
    expect(api.loadEvents.mock.calls[0]?.[0]).toBe('b-1')
    expect(w.findAll('.pipe li')).toHaveLength(6)
    for (const t of ['Event stream', '5 events', 'Budget', 'Run record', 'Order']) expect(w.text(), t).toContain(t)
    w.unmount()
  })
  it('a query-only change to another run stops the old polling and loads the new run', async () => {
    vi.useFakeTimers()
    route.query = { id: 'b-1' }
    api.loadRun.mockResolvedValue(runDetailFixture())
    api.loadEvents.mockResolvedValue(eventsFixture(5))
    const w = await mountSuspended(Run)
    await vi.advanceTimersByTimeAsync(0)
    expect(api.loadRun).toHaveBeenLastCalledWith('b-1')
    route.query = { id: 'b-2' }
    await vi.advanceTimersByTimeAsync(0)
    expect(api.loadRun).toHaveBeenLastCalledWith('b-2')
    expect(api.loadEvents.mock.calls.at(-1)?.[0]).toBe('b-2')
    api.loadRun.mockClear()
    api.loadEvents.mockClear()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(api.loadRun.mock.calls.every((c) => c[0] === 'b-2')).toBe(true)
    expect(api.loadEvents.mock.calls.every((c) => c[0] === 'b-2')).toBe(true)
    expect(api.loadEvents).toHaveBeenCalled()
    w.unmount()
  })
  it('a late 404 of the old run after a query-only change does not mark the new run as missing', async () => {
    vi.useFakeTimers()
    route.query = { id: 'b-1' }
    let late: (e: unknown) => void = () => {}
    api.loadRun.mockImplementation((k: string) => (k === 'b-1' ? new Promise((_, rej) => { late = rej }) : Promise.resolve(runDetailFixture())))
    api.loadEvents.mockResolvedValue(eventsFixture(5))
    const w = await mountSuspended(Run)
    await vi.advanceTimersByTimeAsync(0)
    route.query = { id: 'b-2' }
    await vi.advanceTimersByTimeAsync(0)
    late(new OculusApiError(404, 'not_found'))
    await vi.advanceTimersByTimeAsync(0)
    expect(w.text()).not.toContain('This run does not exist.')
    api.loadRun.mockClear()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(api.loadRun).toHaveBeenCalledWith('b-2')
    w.unmount()
  })
  it('a 404 shows the missing panel and stops the polling', async () => {
    vi.useFakeTimers()
    route.query = { id: 'b-1' }
    api.loadRun.mockRejectedValue(new OculusApiError(404, 'not_found'))
    api.loadEvents.mockRejectedValue(new OculusApiError(404, 'not_found'))
    const w = await mountSuspended(Run)
    await vi.advanceTimersByTimeAsync(0)
    expect(w.text()).toContain('This run does not exist.')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(api.loadRun).toHaveBeenCalledTimes(1)
    w.unmount()
  })
})

describe('Plan page', () => {
  const noTicket = () => { const o = overviewFixture({ workers: [] }); return { ...o, tickets: { ...o.tickets, lockTicket: null } } }
  it('prefers the ticket under the scan lock over the first worker', async () => {
    const o = overviewFixture()
    api.loadPlan.mockResolvedValue(planFixture())
    const w = await mountSuspended(Plan, { global: { provide: provide({ ...o, tickets: { ...o.tickets, lockTicket: 'DGS-600' } }) } })
    await flushPromises()
    expect(api.loadPlan).toHaveBeenCalledWith('DGS-600')
    w.unmount()
  })
  it('uses the ticket in the URL and shows tasks and verdicts', async () => {
    route.query = { ticket: 'DGS-590' }
    api.loadPlan.mockResolvedValue(planFixture())
    const w = await mountSuspended(Plan, { global: { provide: provide(overviewFixture()) } })
    await flushPromises()
    expect(api.loadPlan).toHaveBeenCalledWith('DGS-590')
    expect(w.text()).toContain('Task 3 of 7')
    expect(w.text()).toContain('Reviewer verdicts')
    w.unmount()
  })
  it('falls back to the first worker of the layout overview and does not poll the overview itself', async () => {
    api.loadPlan.mockResolvedValue(planFixture())
    const w = await mountSuspended(Plan, { global: { provide: provide(overviewFixture()) } })
    await flushPromises()
    expect(api.loadPlan).toHaveBeenCalledWith('DGS-590')
    expect(api.loadRuns).not.toHaveBeenCalled()
    w.unmount()
  })
  it('says there is no plan for a ticket without one', async () => {
    route.query = { ticket: 'DGS-9' }
    api.loadPlan.mockResolvedValue({ ...planFixture(), found: false, planFile: null, tasks: [], verdicts: [], tasksTotal: 0, tasksDone: 0 })
    const w = await mountSuspended(Plan, { global: { provide: provide(overviewFixture()) } })
    await flushPromises()
    expect(w.text()).toContain('No plan yet for this ticket.')
    w.unmount()
  })
  it('with no ticket and no worker shows the picker built from the runs, and an unsafe ticket is not used', async () => {
    route.query = { ticket: '../x' }
    api.loadRuns.mockResolvedValue(runsFixture())
    const w = await mountSuspended(Plan, { global: { provide: provide(noTicket()) } })
    await flushPromises()
    expect(api.loadPlan).not.toHaveBeenCalled()
    expect(w.text()).toContain('Pick a ticket.')
    expect(w.findAll('select option').map((o) => o.text())).toEqual(['Choose a ticket', 'DGS-590', 'DGS-588', 'DGS-586', 'DGS-585'])
    await w.find('select').setValue('DGS-588')
    expect(nav).toHaveBeenCalledWith({ query: { ticket: 'DGS-588' } })
    w.unmount()
  })
  it('a failed picker load shows an error with Retry that loads again', async () => {
    api.loadRuns.mockRejectedValueOnce(new Error('x')).mockResolvedValue(runsFixture())
    const w = await mountSuspended(Plan, { global: { provide: provide(noTicket()) } })
    await flushPromises()
    expect(w.find('[role="alert"]').text()).toContain('The tickets are not available right now.')
    await w.find('button.retry').trigger('click')
    await flushPromises()
    expect(api.loadRuns).toHaveBeenCalledTimes(2)
    expect(w.find('[role="alert"]').exists()).toBe(false)
    expect(w.findAll('select option').length).toBeGreaterThan(1)
    w.unmount()
  })
  it('does not call the plan API while the overview has neither arrived nor failed', async () => {
    const w = await mountSuspended(Plan, { global: { provide: provide(null) } })
    await flushPromises()
    expect(api.loadPlan).not.toHaveBeenCalled()
    expect(api.loadRuns).not.toHaveBeenCalled()
    w.unmount()
  })
})

describe('Attention page', () => {
  const item = (id: string, cause: string, since: string) => ({ ...attentionFixture().open[0]!, id, cause, since })
  const poll = async (answers: ReturnType<typeof attentionFixture>[]) => {
    vi.useFakeTimers()
    answers.forEach((a, i) => (i === answers.length - 1 ? api.loadAttention.mockResolvedValue(a) : api.loadAttention.mockResolvedValueOnce(a)))
    const w = await mountSuspended(Attention)
    await vi.advanceTimersByTimeAsync(0)
    const live = w.find('[aria-live="polite"]')
    const next = async () => { await vi.advanceTimersByTimeAsync(10_000); await flushPromises() }
    return { w, live, next }
  }
  const a0 = attentionFixture()
  const withOpen = (open: ReturnType<typeof item>[]) => ({ ...a0, open })
  const base = [item('att-1', 'silent-30-min', '2026-10-22T01:32:00.000Z'), item('att-2', 'review-over-60-min', '2026-10-22T03:10:00.000Z')]

  it('announces nothing on the first poll', async () => {
    const { w, live } = await poll([withOpen(base)])
    expect(w.findAll('tbody tr').length).toBeGreaterThan(0)
    expect(live.text()).toBe('')
    w.unmount()
  })
  it('announces each arrival of two polls, with the count and the newest cause, and the text changes', async () => {
    const one = [...base, item('att-3', 'first-cause', '2026-10-22T03:20:00.000Z')]
    const two = [...one, item('att-4', 'second-cause', '2026-10-22T03:30:00.000Z')]
    const { w, live, next } = await poll([withOpen(base), withOpen(one), withOpen(two)])
    await next()
    expect(live.text()).toBe('1 new attention item: first-cause')
    await next()
    expect(live.text()).toBe('1 new attention item: second-cause')
    w.unmount()
  })
  it('announces a resolve plus an arrival in one poll (same list length)', async () => {
    const swapped = [base[1]!, item('att-9', 'new-cause', '2026-10-22T03:40:00.000Z')]
    const { w, live, next } = await poll([withOpen(base), withOpen(swapped)])
    await next()
    expect(live.text()).toBe('1 new attention item: new-cause')
    w.unmount()
  })
  it('announces nothing when only items resolve', async () => {
    const { w, live, next } = await poll([withOpen(base), withOpen([base[1]!])])
    await next()
    expect(live.text()).toBe('')
    w.unmount()
  })
})
