import { flushPromises } from '@vue/test-utils'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { reactive, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eventsFixture, overviewFixture, planFixture, runDetailFixture, runsFixture } from '../../../tests/nightwatch-fixtures'
import { NightwatchApiError } from '../../composables/nightwatch-api'
import Plan from './plan.vue'
import Run from './run.vue'
import Runs from './runs.vue'

const api = vi.hoisted(() => ({ loadRuns: vi.fn(), loadRun: vi.fn(), loadEvents: vi.fn(), loadPlan: vi.fn() }))
vi.mock('../../composables/nightwatch-api', async (orig) => ({ ...(await orig<typeof import('../../composables/nightwatch-api')>()), ...api }))
const holder = vi.hoisted(() => ({ route: null as unknown as { query: Record<string, string> } }))
const route = reactive({ query: {} as Record<string, string> })
holder.route = route
mockNuxtImport('useRoute', () => () => holder.route)
const nav = vi.hoisted(() => vi.fn())
mockNuxtImport('navigateTo', () => nav)

const provide = (overview: ReturnType<typeof overviewFixture> | null, stale = false) => ({
  nwOverview: { overview: ref(overview), stale: ref(stale), updatedAt: ref(null), attention: ref(0), refresh: vi.fn() },
})

beforeEach(() => { route.query = {}; Object.values(api).forEach((f) => f.mockReset()); nav.mockReset() })
afterEach(() => { vi.useRealTimers() })

describe('Runs page', () => {
  it('sends only valid filters from the URL to the API and shows the table', async () => {
    route.query = { state: 'lost', role: 'nope', trigger: 'away', ticket: 'DGS-1' }
    api.loadRuns.mockResolvedValue(runsFixture())
    const w = await mountSuspended(Runs)
    await flushPromises()
    expect(api.loadRuns).toHaveBeenCalledWith({ state: 'lost', role: '', trigger: 'away', ticket: 'DGS-1', limit: 100 })
    expect(w.findAll('tbody tr')).toHaveLength(4)
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
    expect(w.findAll('tbody tr')).toHaveLength(4)
    expect(w.text()).toContain('The last update failed')
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
  it('a 404 shows the missing panel and stops the polling', async () => {
    vi.useFakeTimers()
    route.query = { id: 'b-1' }
    api.loadRun.mockRejectedValue(new NightwatchApiError(404, 'not_found'))
    api.loadEvents.mockRejectedValue(new NightwatchApiError(404, 'not_found'))
    const w = await mountSuspended(Run)
    await vi.advanceTimersByTimeAsync(0)
    expect(w.text()).toContain('This run does not exist.')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(api.loadRun).toHaveBeenCalledTimes(1)
    w.unmount()
  })
})

describe('Plan page', () => {
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
    const w = await mountSuspended(Plan, { global: { provide: provide(overviewFixture({ workers: [] })) } })
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
    const w = await mountSuspended(Plan, { global: { provide: provide(overviewFixture({ workers: [] })) } })
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
