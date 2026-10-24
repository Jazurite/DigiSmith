// The CLI builds plain objects; this test checks that they parse with the shared schemas (the two copies of the shape cannot drift).
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { liveView } from '../../../packages/cli/src/oculus/live.ts'
import { makeDepot, type Depot } from '../../../packages/cli/src/oculus/fixture.test-util.ts'
import { attentionView, eventsView, overviewView, planView, runsView, runView } from '../../../packages/cli/src/oculus/views.ts'
import { ROLES as CLI_ROLES } from '../../../packages/cli/src/run/schema.ts'
import { writeFileSync, mkdirSync } from 'node:fs'
import { AGENT_ROLES, rowTokensSchema, runTokensSchema, ROLES, liveSchema, liveViewSchema, attentionSchema, eventsSchema, overviewViewSchema, planSchema, runDetailSchema, runsSchema } from '../../nexus-shared/oculus.ts'

const NOW = new Date('2026-10-22T03:00:00.000Z')
let d: Depot
beforeEach(() => { d = makeDepot() })
afterEach(() => d.cleanup())

describe('view output parses with the shared schemas', () => {
  it('a run events file with torn and wrong-shape lines', () => {
    d.writeRun({ ticket: 'DGS-590', run: 'builder-1', role: 'builder', created_at: '2026-10-22T02:20:00.000Z', order: '/d/order-ao-1.md' })
    d.writeEvents('DGS-590', 'builder-1', [{ type: 'started', ts: '2026-10-22T02:20:00.000Z' }])
    appendFileSync(join(d.dir, 'runs', 'DGS-590', 'builder-1', 'events.jsonl'), ['{"seq":2,"ts":"2026-10-22T02:59:00.000Z","type":"tool"}', '{"type":"tool","data":{}}', 'null', '{"seq":4,'].join('\n') + '\n')
    expect(overviewViewSchema.parse(overviewView(d.env, NOW))).toBeTruthy()
    expect(eventsSchema.parse(eventsView(d.env, { run: 'builder-1' })).lines).toHaveLength(2)
    expect(runDetailSchema.parse(runView(d.env, NOW, { run: 'builder-1' }))).toBeTruthy()
  })
  it('an automatic run with a null ticket, a project and the maestro role, and the project filter', () => {
    d.writeRun({ ticket: null, folder: 'DigiSmith', run: 's-abc', role: 'maestro', created_at: '2026-10-22T02:20:00.000Z', project: 'DigiSmith', source: 'auto' })
    d.writeRun({ ticket: 'DGS-590', run: 'builder-1', role: 'builder', created_at: '2026-10-22T02:21:00.000Z', order: '/d/order-ao-1.md', project: 'emma-theme' })
    const all = runsSchema.parse(runsView(d.env, NOW, {}))
    expect(all.runs).toHaveLength(2)
    const only = runsSchema.parse(runsView(d.env, NOW, { project: 'DigiSmith' }))
    expect(only.runs).toHaveLength(1)
    expect(only.runs[0]).toMatchObject({ run: 's-abc', ticket: null, project: 'DigiSmith', source: 'auto', role: 'maestro' })
  })
  it('empty depot', () => {
    expect(overviewViewSchema.parse(overviewView(d.env, NOW))).toBeTruthy()
    expect(attentionSchema.parse(attentionView(d.env, NOW))).toBeTruthy()
    expect(runsSchema.parse(runsView(d.env, NOW, {}))).toBeTruthy()
    expect(planSchema.parse(planView(d.env, { ticket: 'DGS-590' }))).toBeTruthy()
  })
  it('a depot with a run, events and an attention item', () => {
    d.writeRun({ ticket: 'DGS-590', run: 'builder-1', role: 'builder', created_at: '2026-10-22T02:20:00.000Z', order: '/d/order-ao-1.md', seat: 'dev0', model: 'sonnet-5-5' })
    d.writeEvents('DGS-590', 'builder-1', [{ type: 'started', ts: '2026-10-22T02:20:00.000Z', data: { source: 'startup' } }, { type: 'tool', ts: '2026-10-22T02:59:00.000Z', data: { tool: 'Edit', ok: false } }])
    d.writeAttention([{ schema: 'nightwatch-attention/v1', id: 'a', ts: '2026-10-22T02:30:00.000Z', ticket: 'DGS-590', run: 'builder-1', kind: 'blocked', cause: 'x', since: '2026-10-22T02:30:00.000Z' }])
    expect(overviewViewSchema.parse(overviewView(d.env, NOW)).workers).toHaveLength(1)
    expect(attentionSchema.parse(attentionView(d.env, NOW)).open).toHaveLength(1)
    expect(runDetailSchema.parse(runView(d.env, NOW, { run: 'builder-1' }))).toBeTruthy()
    expect(eventsSchema.parse(eventsView(d.env, { run: 'builder-1' })).lines).toHaveLength(2)
  })
})

describe('token fields (DGS-590)', () => {
  it('parse with values and with nulls, and refuse an extra key inside tokens', () => {
    d.writeRun({ ticket: 'DGS-590', run: 'builder-1', role: 'builder', created_at: '2026-10-22T02:20:00.000Z', order: '/d/order-ao-1.md' })
    const nulls = runDetailSchema.parse(runView(d.env, NOW, { run: 'builder-1' }))
    expect(nulls.tokens).toBeNull()
    expect(overviewViewSchema.parse(overviewView(d.env, NOW))).toMatchObject({ burn: null, seats: null })
    const f = { schema: 'oculus-tokens/v1', run: 'builder-1', generated_at: '2026-10-22T02:55:00.000Z', final: false, price_table: { source: 'a', version: 'v1' },
      models: { m: { input: 1, output: 2, cache_read: 3, cache_write_5m: 4, cache_write_1h: 5, responses: 1, tokens: 15, cost_usd: 0.5 } }, total: { tokens: 15, responses: 1, cost_usd: 0.5 }, unpriced_models: [], sessions: 1, buckets: [] }
    writeFileSync(join(d.dir, 'runs', 'DGS-590', 'builder-1', 'tokens.json'), JSON.stringify(f))
    mkdirSync(join(d.dir, 'runs', '.tokens'), { recursive: true })
    writeFileSync(join(d.dir, 'runs', '.tokens', 'burn.json'), JSON.stringify({ schema: 'oculus-burn/v1', generated_at: '2026-10-22T02:50:00.000Z', window_min: 60, tokens: 100, cost_usd: 1.5, runs: 1, unpriced_models: [] }))
    mkdirSync(join(d.dir, 'usage-probe'), { recursive: true })
    writeFileSync(join(d.dir, 'usage-probe', 'seats.json'), JSON.stringify({ schema: 'oculus-seats/v1', generated_at: '2026-10-22T02:58:00.000Z', seats: [{ seat: 'jack', read_at: '2026-10-22T02:58:00.000Z', five_hour: { used_pct: 7, resets_at: '2026-10-22T05:00:00.000Z' }, weekly: null }] }))
    const detail = runDetailSchema.parse(runView(d.env, NOW, { run: 'builder-1' }))
    expect(detail.tokens?.total.tokens).toBe(15)
    expect(runsSchema.parse(runsView(d.env, NOW, {})).runs[0].tokens?.total).toBe(15)
    const o = overviewViewSchema.parse(overviewView(d.env, NOW))
    expect(o.burn?.tokensPerH).toBe(100)
    expect(o.seats?.seats[0].fiveHour?.usedPct).toBe(7)
    expect(() => rowTokensSchema.parse({ total: 1, costUsd: null, unpriced: [], extra: 1 })).toThrow()
    expect(() => runTokensSchema.parse({ ...detail.tokens, extra: 1 })).toThrow()
  })
})

describe('live schemas (DGS-599)', () => {
  const agent = { name: 'dgs-599', pane: 'w2:p5', tab: 'w2:t5', workspace: 'w2', role: 'builder', project: 'DigiSmith', status: 'working', run: null }
  it('the CLI live view output parses with liveViewSchema', () => {
    const herdr = () => ({ ok: true as const, stdout: JSON.stringify({ result: { agents: [{ pane_id: 'w2:p5', tab_id: 'w2:t5', workspace_id: 'w2', name: 'dgs-599', agent_status: 'working', terminal_title: 'secret', cwd: '/Users/x/Workspace/Jazurite/DigiSmith' }] } }) })
    const v = liveView(d.env, NOW, herdr, '/Users/x')
    expect(liveViewSchema.parse(v).agents[0]).toMatchObject({ pane: 'w2:p5', role: 'builder', status: 'working' })
    expect(JSON.stringify(v)).not.toContain('secret')
    expect(liveViewSchema.parse(liveView(d.env, NOW, () => ({ ok: false }))).herdr).toBe('unreachable')
  })
  it('the agent roles and the run roles are the one DGS-598 role set', () => {
    expect([...AGENT_ROLES].sort()).toEqual([...CLI_ROLES].sort())
    expect([...ROLES].sort()).toEqual([...CLI_ROLES].sort())
  })
  it('liveSchema parses connected and disconnected answers and rejects an extra agent field', () => {
    expect(liveSchema.parse({ readAt: '2026-10-22T03:00:00.000Z', herdr: { state: 'connected', asOf: '2026-10-22T03:00:00.000Z' }, agents: [agent] })).toBeTruthy()
    expect(liveSchema.parse({ readAt: '2026-10-22T03:00:00.000Z', herdr: { state: 'disconnected', asOf: null }, agents: [] })).toBeTruthy()
    expect(liveSchema.safeParse({ readAt: '2026-10-22T03:00:00.000Z', herdr: { state: 'connected', asOf: null }, agents: [{ ...agent, terminal_title: 'x' }] }).success).toBe(false)
  })
})
