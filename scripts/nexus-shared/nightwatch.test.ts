import { describe, expect, it } from 'vitest'
import { eventRowSchema, nightwatchErrorSchema, overviewSchema, planSchema, runRowSchema, runsSchema } from './nightwatch.ts'

const row = { run: 'builder-20261022T010000-a1b2c3', ticket: 'DGS-590', role: 'builder', seat: 'dev0', model: null, trigger: 'night-scan', state: 'healthy', phase: 'building', startedAt: '2026-10-22T01:00:00.000Z', endedAt: null, elapsedSec: 60, events: 3, merged: false, pushed: false }

describe('nightwatch schemas', () => {
  it('accepts a run row and refuses an unknown key', () => {
    expect(runRowSchema.safeParse(row).success).toBe(true)
    expect(runRowSchema.safeParse({ ...row, prompt: 'x' }).success).toBe(false)
  })
  it('refuses a bad state, role or trigger', () => {
    expect(runRowSchema.safeParse({ ...row, state: 'sleeping' }).success).toBe(false)
    expect(runRowSchema.safeParse({ ...row, role: 'boss' }).success).toBe(false)
    expect(runRowSchema.safeParse({ ...row, trigger: 'cron' }).success).toBe(false)
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
      scan: { lastScanAt: null, candidates: null, away: false, nightWindow: false, breakerOpen: false, breakerStreak: 0 },
    }
    expect(overviewSchema.safeParse({ ...view, nexus: { status: 'healthy', reasons: [] } }).success).toBe(true)
    expect(overviewSchema.safeParse(view).success).toBe(false)
  })
  it('runs, plan and error shapes', () => {
    expect(runsSchema.safeParse({ readAt: '2026-10-22T01:00:00.000Z', total: 1, runs: [row] }).success).toBe(true)
    expect(planSchema.safeParse({ ticket: 'DGS-590', found: false, planFile: null, tasksTotal: 0, tasksDone: 0, tasks: [], verdicts: [], ledgerError: false }).success).toBe(true)
    expect(nightwatchErrorSchema.safeParse({ error: 'reader_unavailable' }).success).toBe(true)
    expect(nightwatchErrorSchema.safeParse({ error: 'boom' }).success).toBe(false)
  })
})
