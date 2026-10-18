import { execFile } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { JOBS, MAX_TIMEOUT_MS, defineJob, validateJobs } from './registry.ts'

const base = { name: 'night-scan', description: 'd', command: { file: '/bin/echo', args: ['hi'] } }
const withSchedule = (schedule: object) => defineJob({ ...base, schedule } as never)

describe('defineJob defaults', () => {
  it('applies every default', () => {
    expect(defineJob(base)).toEqual({
      ...base, timeoutMs: 600_000, catchUp: 'run-once-in-window', order: 100,
      notify: 'failures', manualOutsideWindow: 'allowed',
    })
  })
  it('keeps given values', () => {
    const job = defineJob({ ...base, order: 5, notify: 'always', catchUp: 'skip', manualOutsideWindow: 'refused', timeoutMs: 1000 })
    expect(job).toMatchObject({ order: 5, notify: 'always', catchUp: 'skip', manualOutsideWindow: 'refused', timeoutMs: 1000 })
  })
})

describe('defineJob undefined fallback', () => {
  it('treats explicit undefined as absent', () => {
    const job = defineJob({ ...base, order: undefined, notify: undefined, catchUp: undefined, manualOutsideWindow: undefined, timeoutMs: undefined })
    expect(job).toEqual(defineJob(base))
  })
})

describe('validateJobs', () => {
  it('requires a finite order', () => {
    for (const order of [Number.NaN, Infinity, -Infinity, '5' as never])
      expect(() => validateJobs([defineJob({ ...base, order })])).toThrow(/order/)
    expect(() => validateJobs([defineJob({ ...base, order: -1 })])).not.toThrow()
  })
  it('accepts a window that crosses midnight with everyMinutes', () => {
    expect(() => validateJobs([withSchedule({ atUtc7: '23:00', windowEndUtc7: '06:00', everyMinutes: 60 })])).not.toThrow()
  })
  it('accepts a same-day window without everyMinutes', () => {
    expect(() => validateJobs([withSchedule({ atUtc7: '00:10', windowEndUtc7: '05:00' })])).not.toThrow()
  })
  it('refuses bad HH:MM', () => {
    for (const t of ['24:00', '7:00', '07:60', 'ab:cd', '07:00:00'])
      expect(() => validateJobs([withSchedule({ atUtc7: t, windowEndUtc7: '06:00' })])).toThrow(/HH:MM/)
    expect(() => validateJobs([withSchedule({ atUtc7: '01:00', windowEndUtc7: '25:00' })])).toThrow(/HH:MM/)
  })
  it('refuses end equal to start', () => {
    expect(() => validateJobs([withSchedule({ atUtc7: '03:00', windowEndUtc7: '03:00' })])).toThrow(/equal/)
  })
  it('limits everyMinutes to whole 5..720', () => {
    for (const n of [4, 721, 5.5, 0, -5, Number.NaN])
      expect(() => validateJobs([withSchedule({ atUtc7: '23:00', windowEndUtc7: '06:00', everyMinutes: n })])).toThrow(/everyMinutes/)
    for (const n of [5, 720])
      expect(() => validateJobs([withSchedule({ atUtc7: '23:00', windowEndUtc7: '06:00', everyMinutes: n })])).not.toThrow()
  })
  it('caps the timeout at 2 h and refuses non-positive', () => {
    expect(MAX_TIMEOUT_MS).toBe(7_200_000)
    expect(() => validateJobs([defineJob({ ...base, timeoutMs: MAX_TIMEOUT_MS + 1 })])).toThrow(/timeoutMs/)
    expect(() => validateJobs([defineJob({ ...base, timeoutMs: MAX_TIMEOUT_MS })])).not.toThrow()
    expect(() => validateJobs([defineJob({ ...base, timeoutMs: 0 })])).toThrow(/timeoutMs/)
  })
  it('requires url-safe names', () => {
    for (const name of ['Bad', 'a b', 'a/b', '', '-x', 'x_y', 'é'])
      expect(() => validateJobs([defineJob({ ...base, name })])).toThrow(/name/)
  })
  it('requires unique names', () => {
    expect(() => validateJobs([defineJob(base), defineJob(base)])).toThrow(/unique|duplicate/)
  })
  it('requires an absolute command file', () => {
    expect(() => validateJobs([defineJob({ ...base, command: { file: 'node', args: [] } })])).toThrow(/absolute/)
  })
})

describe('JOBS', () => {
  it('registers only a valid selftest with no schedule', () => {
    expect(() => validateJobs(JOBS)).not.toThrow()
    expect(JOBS.map((j) => j.name)).toEqual(['selftest'])
    expect(JOBS[0]?.schedule).toBeUndefined()
    expect(isAbsolute(JOBS[0]!.command.file)).toBe(true)
  })
  it('selftest prints one line', async () => {
    const { command } = JOBS[0]!
    const { stdout } = await promisify(execFile)(command.file, command.args)
    expect(stdout.trim().split('\n')).toEqual(['selftest ok'])
  })
})

describe('version literal', () => {
  it('is not spelled in the scheduler files', () => {
    const dir = import.meta.dirname
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts')))
      expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(/['"`]v\d+['"`]/)
  })
})
