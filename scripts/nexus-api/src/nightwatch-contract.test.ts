// The CLI builds plain objects; this test checks that they parse with the shared schemas (the two copies of the shape cannot drift).
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { makeDepot, type Depot } from '../../../packages/cli/src/nightwatch/fixture.test-util.ts'
import { attentionView, eventsView, overviewView, planView, runsView, runView } from '../../../packages/cli/src/nightwatch/views.ts'
import { attentionSchema, eventsSchema, overviewViewSchema, planSchema, runDetailSchema, runsSchema } from '../../nexus-shared/nightwatch.ts'

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
