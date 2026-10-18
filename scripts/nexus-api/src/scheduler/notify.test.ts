import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createClickupNotifier } from './notify.ts'
import { formatUtc7 } from './clock.ts'
import type { EngineEvent } from './engine.ts'
import type { JobDef, RunRecord, RunStatus } from './types.ts'

let dir: string
let calls: string
let fakeDg: { file: string; args: string[] }
const T0 = Date.UTC(2026, 9, 19, 20, 0, 0)

function writeDg(body: string) {
  const script = path.join(dir, 'dg.js')
  fs.writeFileSync(script, `require('fs').appendFileSync(${JSON.stringify(calls)}, JSON.stringify(process.argv.slice(2)) + '\\n');\n${body}`)
  return { file: process.execPath, args: [script, '--prefix'] }
}
const sent = (): string[][] => (fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [])

const job = (over: Partial<JobDef> = {}): JobDef => ({
  name: 'nightly-sync', description: 'd', command: { file: '/bin/true', args: [] }, timeoutMs: 1000,
  catchUp: 'skip', order: 1, notify: 'failures', manualOutsideWindow: 'allowed', ...over,
})
const run = (status: RunStatus, detail = 'boom'): RunRecord => ({
  id: 'r1', job: 'nightly-sync', trigger: 'schedule', slot: null, status,
  startedAt: new Date(T0).toISOString(), startedAtUtc7: formatUtc7(T0), endedAt: null, durationMs: 1, exitCode: 1, detail,
})
const runEvent = (status: RunStatus, detail?: string, j: JobDef = job()): EngineEvent => ({ type: 'run', job: j, run: run(status, detail) })

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notify-test-'))
  calls = path.join(dir, 'calls.jsonl')
  fakeDg = writeDg('')
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('createClickupNotifier', () => {
  for (const status of ['failed', 'timeout', 'interrupted'] as const) {
    it(`sends one comment for ${status}`, async () => {
      const n = createClickupNotifier({ dg: fakeDg, now: () => T0 })
      await n(runEvent(status, 'it broke'))
      const c = sent()
      expect(c).toHaveLength(1)
      expect(c[0].slice(0, 4)).toEqual(['--prefix', 'clickup', 'add-comment', 'DGS-436'])
      expect(c[0]).toHaveLength(5)
      expect(c[0][4]).toContain('nightly-sync')
      expect(c[0][4]).toContain(status)
      expect(c[0][4]).toContain(formatUtc7(T0))
      expect(c[0][4]).toContain('it broke')
    })
  }

  it('sends one comment for an unclean start', async () => {
    const n = createClickupNotifier({ dg: fakeDg, now: () => T0, ticket: 'DGS-1' })
    await n({ type: 'unclean-start', at: new Date(T0).toISOString(), run: null })
    const c = sent()
    expect(c).toHaveLength(1)
    expect(c[0].slice(0, 4)).toEqual(['--prefix', 'clickup', 'add-comment', 'DGS-1'])
    expect(c[0][4]).toContain('unclean')
    expect(c[0][4]).toContain(formatUtc7(T0))
  })

  it('sends ok only with notify always; skipped never', async () => {
    const n = createClickupNotifier({ dg: fakeDg, now: () => T0 })
    await n(runEvent('ok'))
    await n(runEvent('skipped', 'x', job({ notify: 'always' })))
    expect(sent()).toHaveLength(0)
    await n(runEvent('ok', 'fine', job({ notify: 'always' })))
    expect(sent()).toHaveLength(1)
  })

  it('dedupes per job per hour', async () => {
    let t = T0
    const n = createClickupNotifier({ dg: fakeDg, now: () => t })
    await n(runEvent('failed'))
    t = T0 + 3599_000
    await n(runEvent('timeout'))
    expect(sent()).toHaveLength(1)
    await n(runEvent('failed', 'x', job({ name: 'other' })))
    expect(sent()).toHaveLength(2)
    t = T0 + 3600_000
    await n(runEvent('failed'))
    expect(sent()).toHaveLength(3)
  })

  it('dedupes the unclean start on its own key', async () => {
    let t = T0
    const n = createClickupNotifier({ dg: fakeDg, now: () => t })
    const ev: EngineEvent = { type: 'unclean-start', at: 'x', run: null }
    await n(ev)
    await n(runEvent('failed'))
    await n(ev)
    expect(sent()).toHaveLength(2)
    t = T0 + 3600_000
    await n(ev)
    expect(sent()).toHaveLength(3)
  })

  it('cuts detail to 300 characters on one line', async () => {
    const n = createClickupNotifier({ dg: fakeDg, now: () => T0 })
    await n(runEvent('failed', 'a\n\nb   c' + 'z'.repeat(500)))
    const text = sent()[0][4]
    expect(text).toContain('a b c')
    expect(text).not.toContain('\n')
    expect(text).toContain('z'.repeat(300 - 5))
    expect(text).not.toContain('z'.repeat(300 - 4))
  })

  it('times out a hanging dg and logs only', async () => {
    fakeDg = writeDg('setInterval(() => {}, 1000)')
    const errors: unknown[] = []
    const n = createClickupNotifier({ dg: fakeDg, now: () => T0, timeoutMs: 300, logger: { error: (m, f) => { errors.push([m, f]) } } })
    const started = Date.now()
    await expect(n(runEvent('failed'))).resolves.toBeUndefined()
    expect(Date.now() - started).toBeLessThan(15_000)
    expect(errors).toEqual([['scheduler_error', { where: 'notify', code: 'timeout' }]])
  }, 20_000)

  it('logs a failing dg and resolves', async () => {
    fakeDg = writeDg('process.exit(1)')
    const errors: unknown[] = []
    const n = createClickupNotifier({ dg: fakeDg, now: () => T0, logger: { error: (m, f) => { errors.push([m, f]) } } })
    await expect(n(runEvent('failed'))).resolves.toBeUndefined()
    expect(errors).toEqual([['scheduler_error', { where: 'notify', code: 'failed' }]])
    expect(sent()).toHaveLength(1)
  })

  it('logs a missing dg and resolves', async () => {
    const errors: unknown[] = []
    const n = createClickupNotifier({ dg: { file: path.join(dir, 'nope'), args: [] }, now: () => T0, logger: { error: (m, f) => { errors.push([m, f]) } } })
    await expect(n(runEvent('failed'))).resolves.toBeUndefined()
    expect(errors).toHaveLength(1)
    expect((errors[0] as [string, { where: string }])[1].where).toBe('notify')
  })

  it('does not record dedupe when no comment was attempted', async () => {
    const n = createClickupNotifier({ dg: fakeDg, now: () => T0 })
    await n(runEvent('skipped'))
    await n(runEvent('failed'))
    expect(sent()).toHaveLength(1)
  })

  it('builds the text only from job name, status, time and detail', async () => {
    const n = createClickupNotifier({ dg: fakeDg, now: () => T0 })
    const j = job({ description: 'SECRET-DESC', command: { file: '/bin/SECRET-CMD', args: ['SECRET-ARG'] } })
    await n({ type: 'run', job: j, run: { ...run('failed', 'd'), id: 'SECRET-ID', slot: 'SECRET-SLOT' } })
    const joined = JSON.stringify(sent()[0])
    expect(joined).not.toContain('SECRET')
    expect(sent()[0]).toHaveLength(5)
  })
})
