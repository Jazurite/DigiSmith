import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { eventsFixture, planFixture, runDetailFixture, runFixture, runsFixture } from '../../../tests/nightwatch-fixtures'
import BudgetCard from './BudgetCard.vue'
import EventStream from './EventStream.vue'
import OrderCard from './OrderCard.vue'
import PipelineBar from './PipelineBar.vue'
import PlanTasks from './PlanTasks.vue'
import RecordCard from './RecordCard.vue'
import RunFilters from './RunFilters.vue'
import RunsTable from './RunsTable.vue'
import VerdictTable from './VerdictTable.vue'

const NOW = Date.parse('2026-10-22T03:00:00.000Z')

describe('RunsTable', () => {
  it('shows a row per run with a link and the delivery words', async () => {
    const w = await mountSuspended(RunsTable, { props: { runs: runsFixture().runs, nowMs: NOW } })
    expect(w.findAll('tbody tr').length).toBe(runsFixture().runs.length)
    expect(w.find('a').attributes('href')).toMatch(/^\/nightwatch\/run\/\?id=/)
    expect(w.text()).toContain('merged · pushed')
  })
  it('says no run yet', async () => {
    expect((await mountSuspended(RunsTable, { props: { runs: [], nowMs: NOW } })).text()).toContain('No run yet.')
  })
})

describe('PipelineBar', () => {
  it('has six steps in order, a time or a dash, and the word lost', async () => {
    const steps = runDetailFixture().pipeline
    const w = await mountSuspended(PipelineBar, { props: { steps } })
    expect(w.findAll('li')).toHaveLength(6)
    expect(w.text().indexOf('Claimed')).toBeLessThan(w.text().indexOf('Pushed'))
    const lost = steps.map((s, i) => (i === 2 ? { ...s, state: 'lost' as const } : s))
    expect((await mountSuspended(PipelineBar, { props: { steps: lost } })).text()).toContain('lost')
  })
})

describe('EventStream', () => {
  const base = { lines: eventsFixture(5).lines, total: 5, group: 'all' as const, tail: true, hasEarlier: true }
  it('marks the active group with aria-pressed and emits changes', async () => {
    const w = await mountSuspended(EventStream, { props: base })
    expect(w.find('button[aria-pressed="true"]').text()).toContain('All')
    await w.findAll('button').find((b) => b.text() === 'Errors')!.trigger('click')
    expect(w.emitted('update:group')![0]).toEqual(['errors'])
    await w.findAll('button').find((b) => b.text().startsWith('Tail'))!.trigger('click')
    expect(w.emitted('update:tail')![0]).toEqual([false])
  })
  it('shows the count, an earlier link and the empty line', async () => {
    const w = await mountSuspended(EventStream, { props: base })
    expect(w.text()).toContain('5 events')
    await w.find('[data-earlier]').trigger('click')
    expect(w.emitted('earlier')).toHaveLength(1)
    expect((await mountSuspended(EventStream, { props: { ...base, lines: [], total: 0, hasEarlier: false } })).text()).toContain('No events yet.')
  })
  it('shows no prompt text: only type and the listed data keys', async () => {
    const w = await mountSuspended(EventStream, { props: base })
    expect(w.text()).not.toMatch(/session_id|prompt/)
  })
})

describe('BudgetCard, OrderCard', () => {
  it('shows elapsed of limit and the three limits', async () => {
    const w = await mountSuspended(BudgetCard, { props: { budget: { phase: 'building', limitMin: 45, elapsedMin: 41, building: 45, review: 60, merge: 20 } } })
    expect(w.text()).toContain('41')
    expect(w.text()).toContain('45')
    expect(w.text()).toContain('60')
    expect(w.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('41')
  })
  it('an order that is not available is not an error', async () => {
    const w = await mountSuspended(OrderCard, { props: { order: { available: false, text: '' } } })
    expect(w.text()).toContain('Order not available')
    expect(w.find('[role="alert"]').exists()).toBe(false)
  })
})

describe('Plan components', () => {
  it('shows task n of m and the task states', async () => {
    const w = await mountSuspended(PlanTasks, { props: { plan: planFixture() } })
    expect(w.text()).toContain('Task 3 of 7')
    expect(w.text()).toContain('fix round 1')
  })
  it('verdicts and the unreadable ledger notice', async () => {
    const w = await mountSuspended(VerdictTable, { props: { verdicts: planFixture().verdicts, ledgerError: false } })
    expect(w.text()).toContain('parked')
    expect((await mountSuspended(VerdictTable, { props: { verdicts: [], ledgerError: true } })).text()).toContain('ledger unreadable')
  })
})

describe('RunsTable cells', () => {
  const cell = async (row: ReturnType<typeof runFixture>, i: number) => (await mountSuspended(RunsTable, { props: { runs: [row], nowMs: NOW } })).findAll('tbody td')[i]!.text()
  it('has a header row with the nine column names', async () => {
    const w = await mountSuspended(RunsTable, { props: { runs: runsFixture().runs, nowMs: NOW } })
    expect(w.findAll('thead th').map((h) => h.text())).toEqual(['State', 'Key', 'Role', 'Seat / model', 'Trigger', 'Started', 'Duration', 'Tokens', 'Delivery'])
  })
  it('shows delivery for merged and pushed, one of them, or a dash', async () => {
    expect(await cell(runFixture({ endedAt: '2026-10-22T03:00:00.000Z', merged: true, pushed: true }), 8)).toBe('merged · pushed')
    expect(await cell(runFixture({ merged: true }), 8)).toBe('merged')
    expect(await cell(runFixture({ pushed: true }), 8)).toBe('pushed')
    expect(await cell(runFixture(), 8)).toBe('-')
  })
  it('counts a running row live and freezes an ended row; dashes for unknown seat and model; UTC+7 start', async () => {
    expect(await cell(runFixture({ startedAt: '2026-10-22T02:00:00.000Z', elapsedSec: 5 }), 6)).toBe('1:00:00')
    expect(await cell(runFixture({ startedAt: '2026-10-22T02:00:00.000Z', endedAt: '2026-10-22T02:30:00.000Z', elapsedSec: 1800 }), 6)).toBe('0:30:00')
    expect(await cell(runFixture({ seat: null, model: null }), 3)).toBe('- · -')
    expect(await cell(runFixture({ startedAt: '2026-10-22T02:00:00.000Z' }), 5)).toBe('2026-10-22 09:00')
    expect(await cell(runFixture(), 7)).toBe('-')
  })
})

describe('PipelineBar details', () => {
  it('shows a UTC+7 time for a step with a time and a dash for one without, and names each state', async () => {
    const w = await mountSuspended(PipelineBar, { props: { steps: runDetailFixture().pipeline } })
    const li = w.findAll('li')
    expect(li[0]!.find('small').text()).toBe('10:10:44')
    expect(li[3]!.find('small').text()).toBe('-')
    expect(li[2]!.text()).toContain('current')
    expect(li[3]!.text()).toContain('waiting')
    expect(w.text()).not.toContain('lost')
  })
})

describe('EventStream details', () => {
  const base = { lines: eventsFixture(14).lines, total: 14, group: 'all' as const, tail: true, hasEarlier: true }
  it('offers all four groups, pressing only the active one, and emits each', async () => {
    const w = await mountSuspended(EventStream, { props: { ...base, group: 'system' } })
    const groups = ['All', 'Agent', 'System', 'Errors']
    for (const g of groups) expect(w.findAll('button').some((b) => b.text() === g), g).toBe(true)
    expect(w.findAll('button[aria-pressed="true"]').map((b) => b.text())).toEqual(['System', 'Tail: on'])
    for (const g of groups) await w.findAll('button').find((b) => b.text() === g)!.trigger('click')
    expect(w.emitted('update:group')!.map((e) => e[0])).toEqual(['all', 'agent', 'system', 'errors'])
  })
  it('shows Tail: off and turns it on again', async () => {
    const w = await mountSuspended(EventStream, { props: { ...base, tail: false } })
    const b = w.findAll('button').find((x) => x.text().startsWith('Tail'))!
    expect(b.text()).toBe('Tail: off')
    expect(b.attributes('aria-pressed')).toBe('false')
    await b.trigger('click')
    expect(w.emitted('update:tail')![0]).toEqual([true])
  })
  it('hides the earlier link when nothing is earlier, labels the columns and shows key=value with a UTC+7 time', async () => {
    const w = await mountSuspended(EventStream, { props: { ...base, hasEarlier: false } })
    expect(w.find('[data-earlier]').exists()).toBe(false)
    expect(w.findAll('thead th').map((h) => h.text())).toEqual(['Line', 'Time (UTC+7)', 'Type', 'Data'])
    expect(w.findAll('tbody tr')).toHaveLength(14)
    const first = w.findAll('tbody tr')[0]!.findAll('td').map((c) => c.text())
    expect(first).toEqual(['000001', '10:11:00', 'tool', 'name=Edit ok=true'])
    expect(w.findAll('tbody tr')[6]!.text()).toContain('kind=permission_prompt')
  })
})

describe('BudgetCard details', () => {
  it('writes the text as building 0:41 of 45 min and the three limits', async () => {
    const w = await mountSuspended(BudgetCard, { props: { budget: { phase: 'building', limitMin: 45, elapsedMin: 41, building: 45, review: 60, merge: 20 } } })
    expect(w.text()).toContain('building 0:41 of 45 min')
    expect(w.text()).toContain('building 45 min · review 60 min · merge 20 min')
    expect(w.find('[role="progressbar"] i').attributes('style')).toContain('width: 91%')
  })
  it('caps the bar at 100 percent and says over budget', async () => {
    const w = await mountSuspended(BudgetCard, { props: { budget: { phase: 'review', limitMin: 60, elapsedMin: 75, building: 45, review: 60, merge: 20 } } })
    expect(w.find('[role="progressbar"] i').attributes('style')).toContain('width: 100%')
    expect(w.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('60')
    expect(w.text()).toContain('over budget')
  })
  it('says no phase is running when there is no phase', async () => {
    const w = await mountSuspended(BudgetCard, { props: { budget: { phase: null, limitMin: null, elapsedMin: null, building: 45, review: 60, merge: 20 } } })
    expect(w.find('[role="progressbar"]').exists()).toBe(false)
    expect(w.text()).toContain('No phase is running.')
  })
})

describe('RecordCard, OrderCard, Plan details', () => {
  it('lists the record, formats times in UTC+7 and keeps the raw JSON collapsed', async () => {
    const w = await mountSuspended(RecordCard, { props: { record: { branch: 'b', created: '2026-10-22T03:11:02.000Z', n: 3, nested: { a: 1 } } } })
    expect(w.findAll('dt').map((d) => d.text())).toEqual(['branch', 'created', 'n', 'nested'])
    expect(w.text()).toContain('2026-10-22 10:11 (UTC+7)')
    expect(w.text()).toContain('{"a":1}')
    expect(w.find('details').attributes('open')).toBeUndefined()
    expect(w.find('details pre').text()).toContain('"branch": "b"')
  })
  it('shows the order text when it is available', async () => {
    expect((await mountSuspended(OrderCard, { props: { order: { available: true, text: 'Build it.' } } })).text()).toContain('Build it.')
  })
  it('shows every task state and the current task', async () => {
    const w = await mountSuspended(PlanTasks, { props: { plan: planFixture() } })
    expect(w.findAll('tbody tr').map((r) => r.findAll('td')[2]!.text())).toEqual(['done', 'done', 'fix round 1', 'waiting'])
    const done = planFixture()
    done.tasks = done.tasks.map((t) => ({ ...t, state: 'done' as const, round: null }))
    done.tasksTotal = 4
    expect((await mountSuspended(PlanTasks, { props: { plan: done } })).text()).toContain('Task 4 of 4')
  })
  it('shows the three verdict kinds and no table while the ledger is unreadable', async () => {
    const v = planFixture().verdicts
    const w = await mountSuspended(VerdictTable, { props: { verdicts: [...v, { scope: 'task 4', id: 'F2', round: 2, finding: 'x', verdict: 'rejected', reason: 'no' }], ledgerError: false } })
    expect(w.findAll('tbody tr').map((r) => r.findAll('td')[3]!.text())).toEqual(['fixed', 'parked', 'rejected'])
    expect(w.findAll('thead th').map((h) => h.text())).toEqual(['Scope', 'Round', 'Finding', 'Verdict', 'Reason'])
    const bad = await mountSuspended(VerdictTable, { props: { verdicts: v, ledgerError: true } })
    expect(bad.find('table').exists()).toBe(false)
    expect((await mountSuspended(VerdictTable, { props: { verdicts: [], ledgerError: false } })).text()).toContain('No verdicts yet.')
  })
})

describe('RunFilters', () => {
  it('has four labelled controls and emits the whole value on a change', async () => {
    const value = { state: '', role: '', trigger: '', ticket: '' }
    const w = await mountSuspended(RunFilters, { props: { modelValue: value } })
    for (const l of ['State', 'Role', 'Trigger', 'Ticket']) expect(w.find(`[aria-label="${l}"]`).exists(), l).toBe(true)
    await w.find('[aria-label="Role"]').setValue('reviewer')
    expect(w.emitted('update:modelValue')![0]).toEqual([{ ...value, role: 'reviewer' }])
    await w.find('[aria-label="Ticket"]').setValue(' DGS-1 ')
    expect(w.emitted('update:modelValue')![1]).toEqual([{ ...value, ticket: 'DGS-1' }])
    await w.find('[aria-label="State"]').setValue('lost')
    await w.find('[aria-label="Trigger"]').setValue('away')
    expect(w.emitted('update:modelValue')).toHaveLength(4)
  })
})
