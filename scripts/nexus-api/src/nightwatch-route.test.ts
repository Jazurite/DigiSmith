// scripts/nexus-api/src/nightwatch-route.test.ts
import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import type { JobInfo } from './scheduler/types.ts'
import { createNightwatchRoutes, nexusStatus } from './nightwatch-route.ts'
import { ReaderError, type Reader } from './nightwatch-reader.ts'
import type { Env } from './app.ts'

const NOW = Date.parse('2026-10-22T03:00:00.000Z')
const row = { run: 'builder-1', ticket: 'DGS-590', role: 'builder', seat: null, model: null, trigger: 'manual', state: 'healthy', phase: 'building', startedAt: '2026-10-22T02:00:00.000Z', endedAt: null, elapsedSec: 3600, events: 2, merged: false, pushed: false }
const overviewView = {
  readAt: '2026-10-22T03:00:00.000Z', workers: [row], attentionCount: 0,
  tickets: { windowDays: 7, lockTicket: null, rows: [] },
  lastEvents: [],
  scan: { lastScanAt: null, candidates: null, away: false, nightWindow: false, breakerOpen: false, breakerStreak: 0 },
}
const job = (name: string, status: 'ok' | 'failed', endedAt: string): JobInfo => ({
  name, description: '', schedule: null, nextRunAt: null, nextRunAtUtc7: null, running: null, queued: null,
  lastRun: { id: '1', job: name, trigger: 'schedule', slot: null, status, startedAt: endedAt, startedAtUtc7: '', endedAt, durationMs: 1, exitCode: 0, detail: '' },
})

function app(read: Reader, jobs?: () => JobInfo[]) {
  const a = new Hono<Env>()
  a.route('/', createNightwatchRoutes({ read, jobs, now: () => NOW }))
  return a
}
const calls: { view: string; args: unknown }[] = []
const fake: Reader = async (view, args) => {
  calls.push({ view, args })
  if (view === 'overview') return overviewView
  if (view === 'runs') return { readAt: overviewView.readAt, total: 1, runs: [row] }
  if (view === 'attention') return { readAt: overviewView.readAt, open: [], resolved: [] }
  if (view === 'events') return { run: 'builder-1', total: 0, from: 0, lines: [] }
  if (view === 'plan') return { ticket: 'DGS-590', found: false, planFile: null, tasksTotal: 0, tasksDone: 0, tasks: [], verdicts: [], ledgerError: false }
  throw new ReaderError('not_found')
}

describe('nexusStatus', () => {
  it('is healthy when both jobs ended ok and the watchdog is recent', () => {
    expect(nexusStatus([job('autonomous-scan', 'ok', '2026-10-22T02:00:00.000Z'), job('nightwatch-watchdog', 'ok', '2026-10-22T02:55:00.000Z')], false, NOW)).toEqual({ status: 'healthy', reasons: [] })
  })
  it('degrades for a failed job, an old watchdog, or no scheduler', () => {
    expect(nexusStatus([job('autonomous-scan', 'failed', '2026-10-22T02:00:00.000Z'), job('nightwatch-watchdog', 'ok', '2026-10-22T02:55:00.000Z')], false, NOW).reasons).toEqual(['autonomous-scan failed'])
    expect(nexusStatus([job('autonomous-scan', 'ok', '2026-10-22T02:00:00.000Z'), job('nightwatch-watchdog', 'ok', '2026-10-22T02:30:00.000Z')], false, NOW).reasons).toEqual(['nightwatch-watchdog has not run for 15 min'])
    expect(nexusStatus(null, false, NOW)).toEqual({ status: 'degraded', reasons: ['scheduler off'] })
  })
  it('a missing job is degraded, a job that never ran is unknown', () => {
    const scan = job('autonomous-scan', 'ok', '2026-10-22T02:00:00.000Z')
    const wd = job('nightwatch-watchdog', 'ok', '2026-10-22T02:55:00.000Z')
    expect(nexusStatus([scan], false, NOW)).toEqual({ status: 'degraded', reasons: ['nightwatch-watchdog not registered'] })
    expect(nexusStatus([wd], false, NOW)).toEqual({ status: 'degraded', reasons: ['autonomous-scan not registered'] })
    expect(nexusStatus([scan, { ...wd, lastRun: null }], false, NOW)).toEqual({ status: 'unknown', reasons: ['nightwatch-watchdog never ran'] })
    expect(nexusStatus([{ ...scan, lastRun: null }, wd], false, NOW)).toEqual({ status: 'unknown', reasons: ['autonomous-scan never ran'] })
    expect(nexusStatus([{ ...scan, lastRun: null }], false, NOW).status).toBe('degraded')
  })
  it('an open breaker wins', () => {
    expect(nexusStatus([], true, NOW).status).toBe('breaker-open')
  })
})

describe('routes', () => {
  it('overview adds the nexus block and sets no-store', async () => {
    const res = await app(fake, () => [job('autonomous-scan', 'ok', '2026-10-22T02:00:00.000Z'), job('nightwatch-watchdog', 'ok', '2026-10-22T02:58:00.000Z')]).request('/api/v1/nightwatch/overview')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect((await res.json()).nexus).toEqual({ status: 'healthy', reasons: [] })
  })
  it('passes only known, validated query values to the reader', async () => {
    calls.length = 0
    const res = await app(fake).request('/api/v1/nightwatch/runs?state=stalled&role=builder&ticket=DGS-590&trigger=manual&limit=20')
    expect(res.status).toBe(200)
    expect(calls[0]).toEqual({ view: 'runs', args: { state: 'stalled', role: 'builder', ticket: 'DGS-590', trigger: 'manual', limit: 20 } })
  })
  it('refuses an unknown key, a bad value or a bad id without echoing it', async () => {
    for (const url of ['/api/v1/nightwatch/runs?evil=1', '/api/v1/nightwatch/runs?state=bogus', '/api/v1/nightwatch/runs?limit=9999', '/api/v1/nightwatch/runs/..%2Fx', '/api/v1/nightwatch/plan/a%20b', '/api/v1/nightwatch/runs/builder-1/events?group=bogus', '/api/v1/nightwatch/runs/builder-1/events?since=-1']) {
      const res = await app(fake).request(url)
      expect(res.status, url).toBe(400)
      const text = await res.text()
      expect(JSON.parse(text)).toEqual({ error: 'bad_request' })
    }
  })
  it('events pass the cursor, tail, before and group', async () => {
    calls.length = 0
    await app(fake).request('/api/v1/nightwatch/runs/builder-1/events?since=5&tail=200&group=errors&before=9')
    expect(calls[0]).toEqual({ view: 'events', args: { run: 'builder-1', since: 5, tail: 200, group: 'errors', before: 9 } })
  })
  it('maps reader errors: not_found 404, others 503, and a bad answer 503 internal_invalid', async () => {
    expect((await app(fake).request('/api/v1/nightwatch/runs/nope-1')).status).toBe(404)
    const down: Reader = async () => { throw new ReaderError('reader_unavailable') }
    const res = await app(down).request('/api/v1/nightwatch/attention')
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'reader_unavailable' })
    const junk: Reader = async () => ({ nonsense: true })
    const res2 = await app(junk).request('/api/v1/nightwatch/attention')
    expect(res2.status).toBe(503)
    expect(await res2.json()).toEqual({ error: 'internal_invalid' })
  })
  it('an unknown nightwatch path is 404 for every method, a known path with a wrong method is 405', async () => {
    for (const method of ['GET', 'POST', 'DELETE']) {
      const res = await app(fake).request('/api/v1/nightwatch/nope', { method })
      expect(res.status, method).toBe(404)
      expect(await res.json()).toEqual({ error: 'not_found' })
    }
    expect((await app(fake).request('/api/v1/nightwatch/runs/builder-1/events', { method: 'POST' })).status).toBe(405)
    expect((await app(fake).request('/api/v1/nightwatch/plan/DGS-590', { method: 'POST' })).status).toBe(405)
  })
  it('only GET is allowed', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const res = await app(fake).request('/api/v1/nightwatch/overview', { method })
      expect(res.status).toBe(405)
      expect(res.headers.get('Allow')).toBe('GET')
    }
  })
})
