import { describe, expect, it } from 'vitest'
import { TRIGGERS, eventRowSchema, oculusErrorSchema, overviewSchema, pipelineStepSchema, planSchema, runRowSchema, runsSchema } from './oculus.ts'

const row = { run: 'builder-20261022T010000-a1b2c3', ticket: 'DGS-590', role: 'builder', project: null, source: 'start', seat: 'dev0', model: null, trigger: 'night-scan', state: 'healthy', phase: 'building', phaseSince: '2026-10-22T01:00:00.000Z', startedAt: '2026-10-22T01:00:00.000Z', endedAt: null, elapsedSec: 60, events: 3, merged: false, pushed: false, tokens: null, tokensAsOf: null }

describe('oculus schemas', () => {
  it('accepts a run row and refuses an unknown key', () => {
    expect(runRowSchema.safeParse(row).success).toBe(true)
    expect(runRowSchema.safeParse({ ...row, prompt: 'x' }).success).toBe(false)
  })
  it('refuses a timestamp that is not ISO UTC', () => {
    expect(runRowSchema.safeParse({ ...row, startedAt: 'yesterday' }).success).toBe(false)
    expect(runRowSchema.safeParse({ ...row, startedAt: '2026-10-22 01:00:00' }).success).toBe(false)
  })
  it('refuses a bad state, role or trigger', () => {
    expect(runRowSchema.safeParse({ ...row, state: 'sleeping' }).success).toBe(false)
    expect(runRowSchema.safeParse({ ...row, role: 'boss' }).success).toBe(false)
    expect(runRowSchema.safeParse({ ...row, trigger: 'cron' }).success).toBe(false)
  })
  it('TRIGGERS is manual, night-scan, away, auto', () => {
    expect([...TRIGGERS]).toEqual(['manual', 'night-scan', 'away', 'auto'])
    expect(runsSchema.safeParse({ readAt: '2026-10-22T01:00:00.000Z', total: 1, runs: [{ ...row, trigger: 'unknown' }] }).success).toBe(false)
  })
  it('an event row only carries scalar data', () => {
    const ev = { n: 1, seq: 1, ts: '2026-10-22T01:00:00.000Z', type: 'tool', groups: ['agent'], data: { tool: 'Edit', ok: true } }
    expect(eventRowSchema.safeParse(ev).success).toBe(true)
    expect(eventRowSchema.safeParse({ ...ev, data: { tool: { nested: 1 } } }).success).toBe(false)
  })
  it('the overview adds the nexus block to the view', () => {
    const view = {
      readAt: '2026-10-22T01:00:00.000Z', workers: [row], attentionCount: 0,
      tickets: { windowDays: 7, lockTicket: null, rows: [{ phase: 'building', count: 1, oldestSince: '2026-10-22T01:00:00.000Z' }] },
      lastEvents: [{ ts: '2026-10-22T01:00:00.000Z', source: 'DGS-590', kind: 'tool', text: 'tool Edit ok' }],
      burn: null, seats: null,
      scan: { lastScanAt: null, candidates: null, away: false, nightWindow: false, breakerOpen: false, breakerStreak: 0 },
    }
    expect(overviewSchema.safeParse({ ...view, nexus: { status: 'healthy', reasons: [] } }).success).toBe(true)
    expect(overviewSchema.safeParse({ ...view, nexus: { status: 'unknown', reasons: ['x never ran'] } }).success).toBe(true)
    expect(overviewSchema.safeParse({ ...view, nexus: { status: 'bogus', reasons: [] } }).success).toBe(false)
    expect(overviewSchema.safeParse(view).success).toBe(false)
  })
  it('runs, plan and error shapes', () => {
    expect(runsSchema.safeParse({ readAt: '2026-10-22T01:00:00.000Z', total: 1, runs: [row] }).success).toBe(true)
    expect(planSchema.safeParse({ ticket: 'DGS-590', found: false, planFile: null, tasksTotal: 0, tasksDone: 0, tasks: [], verdicts: [], ledgerError: false }).success).toBe(true)
    const v = (verdict: string) => planSchema.safeParse({ ticket: 'DGS-590', found: true, planFile: null, tasksTotal: 0, tasksDone: 0, tasks: [], verdicts: [{ scope: 'task', id: '1', round: 1, finding: 'F1', verdict, reason: '' }], ledgerError: false }).success
    expect(v('fixing')).toBe(true)
    expect(v('open')).toBe(false)
    expect(oculusErrorSchema.safeParse({ error: 'reader_unavailable' }).success).toBe(true)
    expect(oculusErrorSchema.safeParse({ error: 'boom' }).success).toBe(false)
  })
})

describe('phase time fields', () => {
  it('a row needs phaseSince and a step needs durationSec', () => {
    const { phaseSince: _p, ...noSince } = row
    expect(runRowSchema.safeParse(noSince).success).toBe(false)
    expect(runRowSchema.safeParse({ ...row, phaseSince: null }).success).toBe(true)
    expect(pipelineStepSchema.safeParse({ step: 'building', at: null, state: 'waiting' }).success).toBe(false)
    expect(pipelineStepSchema.safeParse({ step: 'building', at: null, state: 'waiting', durationSec: null }).success).toBe(true)
    expect(pipelineStepSchema.safeParse({ step: 'building', at: null, state: 'done', durationSec: -1 }).success).toBe(false)
  })
})
