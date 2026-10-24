// scripts/nexus-web/tests/oculus-fixtures.ts
// Fake, fixed values for web tests, stories and the e2e stub. Each type is the z.infer type of the shared schema, so a shape change breaks the build.
import type { Attention, Events, EventRow, Overview, Plan, RunDetail, RunRow, Runs } from '#oculus-schema'

export function runFixture(over: Partial<RunRow> = {}): RunRow {
  return {
    run: 'builder-20261022T021000-a1b2c3', ticket: 'DGS-590', role: 'builder', project: null, source: 'start', seat: 'dev0', model: 'sonnet-5-5',
    trigger: 'night-scan', state: 'healthy', phase: 'building',
    startedAt: '2026-10-22T02:10:00.000Z', endedAt: null, elapsedSec: 2467, events: 382,
    merged: false, pushed: false,
    ...over,
  }
}

export function overviewFixture(over: Partial<Overview> = {}): Overview {
  return {
    readAt: '2026-10-22T03:42:10.000Z',
    workers: [
      runFixture(),
      runFixture({ run: 'reviewer-20261022T013000-d4e5f6', ticket: 'DGS-588', role: 'reviewer', seat: 'jack', model: 'opus-5-5', state: 'stalled', phase: 'review', startedAt: '2026-10-22T01:30:00.000Z', elapsedSec: 4350, events: 120 }),
    ],
    attentionCount: 2,
    tickets: {
      windowDays: 7, lockTicket: 'DGS-590',
      rows: [
        { phase: 'claimed', count: 0, oldestSince: null },
        { phase: 'building', count: 1, oldestSince: '2026-10-22T02:10:00.000Z' },
        { phase: 'review', count: 0, oldestSince: null },
        { phase: 'merge-ready', count: 0, oldestSince: null },
        { phase: 'merged', count: 4, oldestSince: null },
        { phase: 'released', count: 5, oldestSince: null },
        { phase: 'lost', count: 1, oldestSince: '2026-10-22T01:30:00.000Z' },
      ],
    },
    lastEvents: [
      { ts: '2026-10-22T03:41:58.000Z', source: 'DGS-590', kind: 'agent', text: 'tool Edit ok' },
      { ts: '2026-10-22T03:40:02.000Z', source: 'watchdog', kind: 'attention', text: 'DGS-588 stalled review-over-60-min' },
      { ts: '2026-10-22T03:10:44.000Z', source: 'scan', kind: 'claim', text: 'DGS-590' },
    ],
    scan: { lastScanAt: '2026-10-22T02:10:00.000Z', candidates: 5, away: true, nightWindow: true, breakerOpen: false, breakerStreak: 0 },
    nexus: { status: 'healthy', reasons: [] },
    ...over,
  }
}

export function attentionFixture(): Attention {
  return {
    readAt: '2026-10-22T03:42:10.000Z',
    open: [
      { id: 'att-1', ticket: 'DGS-588', run: 'reviewer-20261022T013000-d4e5f6', kind: 'lost', cause: 'silent-30-min', since: '2026-10-22T01:32:00.000Z', causeClass: 'transient', retryEligible: true },
      { id: 'att-2', ticket: 'DGS-588', run: 'reviewer-20261022T013000-d4e5f6', kind: 'stalled', cause: 'review-over-60-min', since: '2026-10-22T03:10:00.000Z', causeClass: 'unknown', retryEligible: false },
    ],
    resolved: [
      { id: 'att-0', ticket: 'DGS-586', kind: 'blocked', by: 'watchdog', ts: '2026-10-21T16:05:00.000Z', note: 'tool seen' },
    ],
  }
}

export function runsFixture(): Runs {
  const runs = [
    runFixture(),
    runFixture({ run: 'reviewer-20261022T013000-d4e5f6', ticket: 'DGS-588', role: 'reviewer', seat: 'jack', model: 'opus-5-5', state: 'stalled', phase: 'review', startedAt: '2026-10-22T01:30:00.000Z', elapsedSec: 4350 }),
    runFixture({ run: 'builder-20261021T144000-aa11bb', ticket: 'DGS-586', trigger: 'manual', state: 'ended', phase: null, startedAt: '2026-10-21T14:40:00.000Z', endedAt: '2026-10-21T16:45:00.000Z', elapsedSec: 7500, merged: true, pushed: true }),
    runFixture({ run: 'builder-20261021T110200-cc22dd', ticket: 'DGS-585', trigger: 'away', seat: 'jack', state: 'lost', phase: null, startedAt: '2026-10-21T11:02:00.000Z', endedAt: '2026-10-21T11:57:00.000Z', elapsedSec: 3300 }),
  ]
  return { readAt: '2026-10-22T03:42:10.000Z', total: runs.length, runs }
}

export function runDetailFixture(): RunDetail {
  return {
    readAt: '2026-10-22T03:42:10.000Z',
    row: runFixture(),
    pipeline: [
      { step: 'claimed', at: '2026-10-22T03:10:44.000Z', state: 'done' },
      { step: 'worktree-ready', at: '2026-10-22T03:11:02.000Z', state: 'done' },
      { step: 'building', at: '2026-10-22T03:11:20.000Z', state: 'current' },
      { step: 'review', at: null, state: 'waiting' },
      { step: 'merged', at: null, state: 'waiting' },
      { step: 'pushed', at: null, state: 'waiting' },
    ],
    budget: { phase: 'building', limitMin: 120, elapsedMin: 41, building: 41, review: 0, merge: 0 },
    record: { branch: 'DGS-590__example-branch', seat: 'dev0' },
    order: { available: true, text: 'Build DGS-590 on the example branch.' },
  }
}

export function eventsFixture(n = 5): Events {
  const lines: EventRow[] = Array.from({ length: n }, (_, i): EventRow => {
    const blocked = (i + 1) % 7 === 0
    return {
      n: i + 1, seq: i + 1, ts: new Date(Date.parse('2026-10-22T03:11:00.000Z') + i * 1000).toISOString(),
      type: blocked ? 'blocked' : 'tool',
      groups: blocked ? ['system', 'errors'] : ['agent'],
      data: blocked ? { kind: 'permission_prompt' } : { name: 'Edit', ok: true },
    }
  })
  return { run: 'builder-20261022T021000-a1b2c3', total: n, from: 0, lines }
}

export function planFixture(): Plan {
  return {
    ticket: 'DGS-590', found: true, planFile: '.digismith/board/DGS-590/plan.md',
    tasksTotal: 7, tasksDone: 2,
    tasks: [
      { n: 1, title: 'Schema and fixtures', state: 'done', round: null },
      { n: 2, title: 'Reader', state: 'done', round: null },
      { n: 3, title: 'Route', state: 'fix-round', round: 1 },
      { n: 4, title: 'Composable', state: 'waiting', round: null },
    ],
    verdicts: [
      { scope: 'task 2', id: 'F1', round: 1, finding: 'Missing null check', verdict: 'fixed', reason: 'added the check' },
      { scope: 'task 3', id: 'F1', round: 1, finding: 'Slow route', verdict: 'parked', reason: 'later ticket' },
      { scope: 'task 3', id: 'F2', round: 2, finding: 'Flaky retry', verdict: 'fixing', reason: '' },
    ],
    ledgerError: false,
  }
}
