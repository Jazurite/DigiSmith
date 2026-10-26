import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { eventsFixture, unpricedTokensFixture, tokensFixture, planFixture, runDetailFixture, runFixture, runsFixture } from '../../../tests/oculus-fixtures'
import BudgetCard from './BudgetCard.vue'
import EventStream from './EventStream.vue'
import OrderCard from './OrderCard.vue'
import PipelineBar from './PipelineBar.vue'
import PlanTasks from './PlanTasks.vue'
import RecordCard from './RecordCard.vue'
import TokensCard from './TokensCard.vue'
import RunFilters from './RunFilters.vue'
import RunsTable from './RunsTable.vue'
import VerdictTable from './VerdictTable.vue'

const NOW = Date.parse('2026-10-22T03:00:00.000Z')

describe('RunsTable', () => {
  it('shows a row per run with a link and the delivery words', async () => {
    const w = await mountSuspended(RunsTable, { props: { runs: runsFixture().runs, nowMs: NOW } })
    expect(w.findAll('tbody tr').length).toBe(runsFixture().runs.length)
    expect(w.find('a').attributes('href')).toMatch(/^\/run\/\?id=/)
    expect(w.text()).toContain('merged · pushed')
  })
  it('has a Project column and gives a maestro or conductor row "-" with no health dot (Task 9)', async () => {
    const runs = runsFixture().runs
    const w = await mountSuspended(RunsTable, { props: { runs, nowMs: NOW } })
    expect(w.findAll('thead th').map((t) => t.text())).toContain('Project')
    const rows = w.findAll('tbody tr')
    runs.forEach((r, i) => {
      const row = rows[i]!
      expect(row.find('td[data-label="Project"]').text(), r.run).toBe(r.project ?? '-')
      const unflagged = r.role === 'maestro' || r.role === 'conductor'
      expect(row.find('td[data-label="State"] .st').exists(), r.run).toBe(!unflagged)
      if (unflagged) expect(row.find('td[data-label="State"]').text()).toBe('-')
    })
    expect(runs.some((r) => r.role === 'maestro') && runs.some((r) => r.role === 'conductor')).toBe(true)
  })
  it('the Duration cell carries the phase for a running run and the duration only otherwise', async () => {
    const w = await mountSuspended(RunsTable, { props: { runs: runsFixture().runs, nowMs: NOW } })
    const cells = w.findAll('td[data-label="Duration"]')
    expect(cells[0]!.find('[aria-hidden="true"]').text()).toBe('0:50:00 · building 0:14')
    expect(cells[0]!.find('.sr').text()).toBe('50 min, building for 14 min')
    expect(cells[1]!.find('[aria-hidden="true"]').text()).toBe('1:30:00 · review 1:30')
    expect(cells[2]!.find('[aria-hidden="true"]').text()).toBe('2:05:00')   // ended
    expect(cells[2]!.text()).not.toContain('·')
    expect(cells[3]!.find('[aria-hidden="true"]').text()).toBe('0:55:00')   // lost
    expect(w.findAll('th').map((t) => t.text())).not.toContain('Phase')
  })
  it('says no run yet', async () => {
    expect((await mountSuspended(RunsTable, { props: { runs: [], nowMs: NOW } })).text()).toContain('No run yet.')
  })
})

describe('PipelineBar', () => {
  it('has six steps in order, a time or a dash, and the word lost', async () => {
    const steps = runDetailFixture().pipeline
    const w = await mountSuspended(PipelineBar, { props: { steps, nowMs: NOW } })
    expect(w.findAll('li')).toHaveLength(6)
    expect(w.text().indexOf('Claimed')).toBeLessThan(w.text().indexOf('Pushed'))
    const lost = steps.map((s, i) => (i === 2 ? { ...s, state: 'lost' as const } : s))
    expect((await mountSuspended(PipelineBar, { props: { steps: lost, nowMs: NOW } })).text()).toContain('lost')
  })
  it('shows each done step\'s duration, the current step\'s time only, and words for screen readers', async () => {
    const w = await mountSuspended(PipelineBar, { props: { steps: runDetailFixture().pipeline, nowMs: NOW } })
    const dur = w.findAll('li .dur').map((d) => d.text())
    expect(dur).toEqual(['0:01', '0:00', '0:50', '-', '-', '-'])
    expect(w.findAll('li')[2]!.find('.dur').classes()).toContain('live')
    expect(w.text()).not.toContain('now')
    expect(w.findAll('li')[0]!.find('.sr').text()).toBe('(done, 1 min)')
    expect(w.findAll('li')[2]!.find('.sr').text()).toBe('(current, 50 min so far)')
    expect(w.findAll('li')[3]!.find('.sr').text()).toBe('(waiting)')
  })
  it('an ended run: Pushed shows no duration; a lost step shows the word lost and a dash', async () => {
    const ended = runDetailFixture().pipeline.map((s) => ({ ...s, at: s.at ?? '2026-10-22T02:59:00.000Z', state: 'done' as const, durationSec: s.step === 'pushed' ? null : 600 }))
    const e = await mountSuspended(PipelineBar, { props: { steps: ended, nowMs: NOW } })
    expect(e.findAll('li .dur').map((d) => d.text())).toEqual(['0:10', '0:10', '0:10', '0:10', '0:10', ''])
    const lost = runDetailFixture().pipeline.map((s) => (s.state === 'current' ? { ...s, state: 'lost' as const } : s))
    const l = await mountSuspended(PipelineBar, { props: { steps: lost, nowMs: NOW } })
    expect(l.findAll('li')[2]!.text()).toContain('lost')
    expect(l.findAll('li')[2]!.find('.dur').text()).toBe('-')
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
  it('has a header row with the ten column names', async () => {
    const w = await mountSuspended(RunsTable, { props: { runs: runsFixture().runs, nowMs: NOW } })
    expect(w.findAll('thead th').map((h) => h.text())).toEqual(['State', 'Key', 'Role', 'Project', 'Seat / model', 'Trigger', 'Started', 'Duration', 'Tokens', 'Cost', 'Delivery'])
  })
  it('shows delivery for merged and pushed, one of them, or a dash', async () => {
    expect(await cell(runFixture({ endedAt: '2026-10-22T03:00:00.000Z', merged: true, pushed: true }), 10)).toBe('merged · pushed')
    expect(await cell(runFixture({ merged: true }), 10)).toBe('merged')
    expect(await cell(runFixture({ pushed: true }), 10)).toBe('pushed')
    expect(await cell(runFixture(), 10)).toBe('-')
  })
  it('shows a dash for a null ticket and still links to the run', async () => {
    const w = await mountSuspended(RunsTable, { props: { runs: [runFixture({ ticket: null, run: 's-abc' })], nowMs: NOW } })
    const a = w.findAll('tbody td')[1]!.find('a')
    expect(a.text()).toBe('-')
    expect(a.attributes('href')).toContain('s-abc')
  })
  it('counts a running row live and freezes an ended row; dashes for unknown seat and model; UTC+7 start', async () => {
    const shown = async (row: ReturnType<typeof runFixture>) => (await mountSuspended(RunsTable, { props: { runs: [row], nowMs: NOW } })).find('td[data-label="Duration"] [aria-hidden="true"]').text()
    expect(await shown(runFixture({ startedAt: '2026-10-22T02:00:00.000Z', elapsedSec: 5 }))).toMatch(/^1:00:00/)
    expect(await shown(runFixture({ startedAt: '2026-10-22T02:00:00.000Z', endedAt: '2026-10-22T02:30:00.000Z', elapsedSec: 1800, phase: null, phaseSince: null }))).toBe('0:30:00')
    expect(await cell(runFixture({ seat: null, model: null }), 4)).toBe('- · -')
    expect(await cell(runFixture({ startedAt: '2026-10-22T02:00:00.000Z' }), 6)).toBe('2026-10-22 09:00')
    expect(await cell(runFixture(), 8)).toBe('-')
    expect(await cell(runFixture(), 3)).toBe('-')   // Project: none
    expect(await cell(runFixture({ project: 'Emma' }), 3)).toBe('Emma')
  })
})

describe('RunsTable key (DGS-622)', () => {
  const key = async (row: ReturnType<typeof runFixture>) => (await mountSuspended(RunsTable, { props: { runs: [row], nowMs: NOW } })).find('td[data-label="Key"]').text()
  it('Key falls back to the project, then to a dash', async () => {
    expect(await key(runFixture({ ticket: null, project: 'DigiSmith' }))).toBe('DigiSmith')
    expect(await key(runFixture({ ticket: null, project: null }))).toBe('-')
    expect(await key(runFixture({ ticket: 'DGS-1', project: 'DigiSmith' }))).toBe('DGS-1')
  })
})

describe('RunsTable tokens and cost (DGS-590)', () => {
  const cells = async (row: ReturnType<typeof runFixture>) => {
    const w = await mountSuspended(RunsTable, { props: { runs: [row], nowMs: NOW } })
    return { tokens: w.find('td[data-label="Tokens"]'), cost: w.find('td[data-label="Cost"]') }
  }
  it('shows a fresh snapshot compactly with the exact number in the title', async () => {
    const c = await cells(runFixture({ tokens: { total: 1_234_567, costUsd: 3.411, unpriced: [] }, tokensAsOf: '2026-10-22T03:40:00.000Z' }))
    expect(c.tokens.text()).toBe('1.2M')
    expect(c.tokens.attributes('title')).toBe('1234567')
    expect(c.cost.text()).toBe('$3.41')
    expect(c.tokens.classes()).toContain('num')
    expect(c.cost.classes()).toContain('num')
  })
  it('a stale row shows a dash and the time it went stale', async () => {
    const c = await cells(runFixture({ tokens: null, tokensAsOf: '2026-10-22T02:15:00.000Z' }))
    expect(c.tokens.text()).toBe('-')
    expect(c.tokens.attributes('title')).toMatch(/stale since 09:15/)
    expect(c.cost.attributes('title')).toMatch(/stale since/)
  })
  it('an unpriced model leaves the cost a dash with the model name', async () => {
    const c = await cells(runFixture({ tokens: { total: 7000, costUsd: null, unpriced: ['claude-mystery-9'] }, tokensAsOf: '2026-10-22T03:40:00.000Z' }))
    expect(c.tokens.text()).toBe('7.0k')
    expect(c.cost.text()).toBe('-')
    expect(c.cost.attributes('title')).toMatch(/unpriced model: claude-mystery-9/)
  })
  it('a run with no snapshot says so', async () => {
    const c = await cells(runFixture())
    expect(c.tokens.text()).toBe('-')
    expect(c.tokens.attributes('title')).toBe('no snapshot')
    expect(c.cost.attributes('title')).toBe('no snapshot')
  })
})

describe('TokensCard (DGS-590)', () => {
  it('has a row per model, a Total row, column headers with scope and the footer', async () => {
    const t = tokensFixture()
    const w = await mountSuspended(TokensCard, { props: { tokens: t, asOf: t.generatedAt } })
    expect(w.text()).toContain('Tokens and cost')
    expect(w.findAll('tbody tr')).toHaveLength(t.models.length + 1)
    const total = w.findAll('tbody tr').at(-1)!
    expect(total.find('th[scope="row"]').text()).toBe('Total')
    expect(total.find('th').attributes('role')).toBe('rowheader')
    expect(total.find('[aria-hidden]').exists()).toBe(false)
    expect(total.find('th').attributes('data-label')).toBeUndefined()
    expect(w.findAll('thead th').every((h) => h.attributes('scope') === 'col')).toBe(true)
    expect(w.findAll('thead th').map((h) => h.text())).toEqual(['Model', 'Input', 'Output', 'Cache read', 'Cache write 5m', 'Cache write 1h', 'Tokens', 'Cost'])
    expect(w.text()).toContain('Anthropic price table 2026-10-18')
    expect(w.text()).toContain('10:40 (UTC+7)')
    expect(w.text()).toContain('counting')
    expect(w.find('td[title="120000"]').text()).toBe('120k')
  })
  it('does not say counting when the snapshot is final, and shows a dash for an unpriced model', async () => {
    const t = unpricedTokensFixture()
    const w = await mountSuspended(TokensCard, { props: { tokens: { ...t, final: true }, asOf: t.generatedAt } })
    expect(w.text()).not.toContain('counting')
    expect(w.find('td[title="unpriced model"]').text()).toBe('-')
  })
  it('says there is no snapshot, or since when it is stale', async () => {
    expect((await mountSuspended(TokensCard, { props: { tokens: null, asOf: null } })).text()).toContain('No token snapshot.')
    expect((await mountSuspended(TokensCard, { props: { tokens: null, asOf: '2026-10-22T02:15:00.000Z' } })).text()).toContain('Stale since 09:15 (UTC+7).')
  })
})

describe('PipelineBar details', () => {
  it('shows a UTC+7 time for a step with a time and a dash for one without, and names each state', async () => {
    const w = await mountSuspended(PipelineBar, { props: { steps: runDetailFixture().pipeline, nowMs: NOW } })
    const li = w.findAll('li')
    expect(li[0]!.find('small').text()).toBe('09:09')
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
  it('shows the four verdict kinds and no table while the ledger is unreadable', async () => {
    const v = planFixture().verdicts
    const w = await mountSuspended(VerdictTable, { props: { verdicts: [...v, { scope: 'task 4', id: 'F2', round: 2, finding: 'x', verdict: 'rejected', reason: 'no' }], ledgerError: false } })
    expect(w.findAll('tbody tr').map((r) => r.findAll('td')[3]!.text())).toEqual(['fixed', 'parked', 'fixing', 'rejected'])
    expect(w.findAll('thead th').map((h) => h.text())).toEqual(['Scope', 'Round', 'Finding', 'Verdict', 'Reason'])
    const bad = await mountSuspended(VerdictTable, { props: { verdicts: v, ledgerError: true } })
    expect(bad.find('table').exists()).toBe(false)
    expect((await mountSuspended(VerdictTable, { props: { verdicts: [], ledgerError: false } })).text()).toContain('No verdicts yet.')
  })
})

describe('RunFilters', () => {
  it('has five labelled controls and emits the whole value on a change', async () => {
    const value = { state: '', role: '', trigger: '', project: '', ticket: '' }
    const w = await mountSuspended(RunFilters, { props: { modelValue: value, projects: ['DigiSmith'] } })
    for (const l of ['State', 'Role', 'Trigger', 'Project', 'Ticket']) expect(w.find(`[aria-label="${l}"]`).exists(), l).toBe(true)
    await w.find('[aria-label="Role"]').setValue('reviewer')
    expect(w.emitted('update:modelValue')![0]).toEqual([{ ...value, role: 'reviewer' }])
    await w.find('[aria-label="Ticket"]').setValue(' DGS-1 ')
    expect(w.emitted('update:modelValue')![1]).toEqual([{ ...value, ticket: 'DGS-1' }])
    await w.find('[aria-label="State"]').setValue('lost')
    await w.find('[aria-label="Trigger"]').setValue('away')
    expect(w.emitted('update:modelValue')).toHaveLength(4)
  })
  it('offers maestro and conductor as roles and the given projects (Task 9)', async () => {
    const value = { state: '', role: '', trigger: '', project: '', ticket: '' }
    const w = await mountSuspended(RunFilters, { props: { modelValue: value, projects: ['DigiSmith', 'Emma'] } })
    const opts = (l: string) => w.find(`[aria-label="${l}"]`).findAll('option').map((o) => o.attributes('value'))
    expect(opts('Role')).toEqual(expect.arrayContaining(['maestro', 'conductor', 'builder', 'reviewer', 'scout', 'other']))
    expect(opts('Project')).toEqual(['', 'DigiSmith', 'Emma'])
    await w.find('[aria-label="Project"]').setValue('Emma')
    expect(w.emitted('update:modelValue')![0]).toEqual([{ ...value, project: 'Emma' }])
  })
})
