import { execFile } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { currentSlot, slotsOfNight } from './clock.ts'
import { JOBS, MAX_TIMEOUT_MS, defineJob, scanScheduleOf, validateJobs } from './registry.ts'

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
  it('registers a valid selftest with no schedule and the two autonomous jobs', () => {
    expect(() => validateJobs(JOBS)).not.toThrow()
    expect(JOBS.map((j) => j.name)).toEqual(['selftest', 'autonomous-scan', 'autonomous-report', 'nightwatch-watchdog', 'schedule-release', 'oculus-tokens'])
    expect(JOBS[0]?.schedule).toBeUndefined()
    expect(isAbsolute(JOBS[0]!.command.file)).toBe(true)
  })
  it('keeps names url-safe and unique, and every command path absolute', () => {
    const names = JOBS.map((j) => j.name)
    expect(new Set(names).size).toBe(names.length)
    for (const name of names) expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    for (const job of JOBS) {
      expect(isAbsolute(job.command.file)).toBe(true)
      for (const arg of job.command.args.filter((a) => a.endsWith('.ts') || a.startsWith('/'))) expect(isAbsolute(arg)).toBe(true)
    }
  })
  it('autonomous jobs run the built CLI of the main checkout, not strip-types source', () => {
    const dist = join(homedir(), 'Workspace', 'Jazurite', 'DigiSmith', 'packages', 'cli', 'dist', 'index.js')
    for (const name of ['autonomous-scan', 'autonomous-report']) {
      const { command } = JOBS.find((j) => j.name === name)!
      expect(command.file).toBe(process.execPath)
      expect(command.args[0]).toBe(dist)
      expect(command.args).not.toContain('--experimental-strip-types')
    }
  })
  it('autonomous-scan has 48 thirty-minute slots for one night key and reads its interval from the config', () => {
    const scan = JOBS.find((j) => j.name === 'autonomous-scan')!
    const slots = slotsOfNight('2026-10-19', scan.schedule!)
    expect(slots.map((s) => s.key)).toEqual(Array.from({ length: 48 }, (_, i) => `2026-10-19@${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`))
    for (const s of slots) expect(s.atMs).toBeLessThan(s.windowEndMs)
    expect(scan.schedule!.everyMinutes).toBe(30)
    expect(typeof scan.scheduleOf).toBe('function')
    // 09:00 to 18:00 UTC+7 inclusive of 09:00 and 17:30: 18 slots
    expect(slots.filter((s) => s.key >= '2026-10-19@09:00' && s.key < '2026-10-19@18:00')).toHaveLength(18)
    expect(slots[0]!.key).toBe('2026-10-19@00:00')
    expect(slots[47]!.key).toBe('2026-10-19@23:30')
    expect(scan.catchUp).toBe('skip')
    expect(scan.manualOutsideWindow).toBe('allowed')
    expect(scan.command.args).toContain('autonomous')
    expect(scan.command.args).toContain('scan')
  })
  it('scanSchedule follows the config file each call and validates', () => {
    const f = join(mkdtempSync(join(tmpdir(), 'reg-')), 'config.yml')
    const of = scanScheduleOf(f)
    writeFileSync(f, 'nightwatch:\n  scan_every_minutes: 15\n')
    expect(of()).toEqual({ atUtc7: '00:00', windowEndUtc7: '23:59', everyMinutes: 15 })
    writeFileSync(f, 'nightwatch:\n  scan_every_minutes: 4\n')
    expect(of().everyMinutes).toBe(30)
    writeFileSync(f, 'profile: x\n')
    expect(of().everyMinutes).toBe(30)
    expect(() => validateJobs([defineJob({ ...base, schedule: of() })])).not.toThrow()
  })
  it('scanScheduleOf reports a bad value once per change, not at every call', () => {
    const f = join(mkdtempSync(join(tmpdir(), 'reg-')), 'config.yml')
    const seen: string[] = []
    const of = scanScheduleOf(f, (p) => seen.push(p))
    writeFileSync(f, 'nightwatch:\n  scan_every_minutes: 4\n')
    of(); of(); of()
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatch(/scan_every_minutes/)
    writeFileSync(f, 'nightwatch:\n  scan_every_minutes: 30\n')
    of()
    writeFileSync(f, 'nightwatch:\n  scan_every_minutes: x\n')
    of(); of()
    expect(seen).toHaveLength(2)
  })
  it('the other three five-minute jobs stay at 5 with no scheduleOf', () => {
    for (const name of ['nightwatch-watchdog', 'schedule-release', 'oculus-tokens']) {
      const j = JOBS.find((x) => x.name === name)!
      expect(j.schedule).toEqual({ atUtc7: '00:00', windowEndUtc7: '23:59', everyMinutes: 5 })
      expect(j.scheduleOf).toBeUndefined()
    }
  })
  it('autonomous-report has one slot at 06:00', () => {
    const report = JOBS.find((j) => j.name === 'autonomous-report')!
    expect(slotsOfNight('2026-10-19', report.schedule!).map((s) => s.key)).toEqual(['2026-10-19@06:00'])
    expect(report.manualOutsideWindow).toBe('allowed')
    expect(report.catchUp).toBe('run-once-in-window')
  })
  it('oculus-tokens runs dg tokens runs every 5 min and starts no model', () => {
    const job = JOBS.find((j) => j.name === 'oculus-tokens')!
    expect(job.schedule).toEqual({ atUtc7: '00:00', windowEndUtc7: '23:59', everyMinutes: 5 })
    expect(job.command.args.slice(-2)).toEqual(['tokens', 'runs'])
    expect(job.catchUp).toBe('skip')
    expect(job.timeoutMs).toBe(4 * 60 * 1000)
  })
  it('nightwatch-watchdog runs all day every five minutes and calls autonomous watch', () => {
    const job = JOBS.find((j) => j.name === 'nightwatch-watchdog')!
    expect(job.schedule).toEqual({ atUtc7: '00:00', windowEndUtc7: '23:59', everyMinutes: 5 })
    expect(job.catchUp).toBe('skip')
    expect(job.timeoutMs).toBe(120000)
    expect(job.order).toBe(40)
    expect(job.command.file).toBe(process.execPath)
    expect(job.command.args.slice(-2)).toEqual(['autonomous', 'watch'])
    for (const hhmm of ['10:00', '23:55']) {
      const ms = Date.parse(`2026-10-19T${hhmm}:00+07:00`)
      expect(currentSlot(ms, job.schedule!)).not.toBeNull()
    }
    expect(slotsOfNight('2026-10-19', job.schedule!).map((s) => s.key)).toContain('2026-10-19@10:00')
  })
  it('schedule-release runs the built CLI every 5 minutes all day, skips missed slots, before the scan', () => {
    const job = JOBS.find((j) => j.name === 'schedule-release')!
    expect(job.schedule).toEqual({ atUtc7: '00:00', windowEndUtc7: '23:59', everyMinutes: 5 })
    expect(job.command.file).toBe(process.execPath)
    expect(job.command.args.slice(1)).toEqual(['autonomous', 'schedule-release'])
    expect(job.command.args[0]).toBe(JOBS.find((j) => j.name === 'autonomous-scan')!.command.args[0])
    expect(job).toMatchObject({ timeoutMs: 2 * 60 * 1000, catchUp: 'skip', order: 45, notify: 'failures', manualOutsideWindow: 'allowed' })
    expect(job.order).toBeLessThan(JOBS.find((j) => j.name === 'autonomous-scan')!.order)
    expect(job.description).toBe('Scheduling: move each scheduled ticket whose Scheduled at is past to to do (both Modes). No model tokens.')
  })
  it('selftest prints one line and exits 0 without SELFTEST_FAIL', async () => {
    const { command } = JOBS[0]!
    const env = { ...process.env }
    delete env.SELFTEST_FAIL
    const { stdout, stderr } = await promisify(execFile)(command.file, command.args, { env })
    expect(stdout.trim().split('\n')).toEqual(['selftest ok'])
    expect(stderr).toBe('')
  })
  it('selftest exits 1 with one stderr line when SELFTEST_FAIL=1', async () => {
    const { command } = JOBS[0]!
    const err = await promisify(execFile)(command.file, command.args, { env: { ...process.env, SELFTEST_FAIL: '1' } })
      .then(() => null, (e: { code?: number; stdout?: string; stderr?: string }) => e)
    expect(err?.code).toBe(1)
    expect(err?.stdout).toBe('')
    expect(err?.stderr?.trim().split('\n')).toEqual(['selftest failed (SELFTEST_FAIL=1)'])
  })
})

describe('version literal', () => {
  it('is not spelled in the scheduler files', () => {
    const dir = import.meta.dirname
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts')))
      expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(/['"`]v\d+['"`]/)
  })
})

describe('autonomous-scan text', () => {
  it('autonomous-scan says it claims at any hour', () => {
    expect(JOBS.find((j) => j.name === 'autonomous-scan')!.description).toBe('Autonomous Operation: at any hour, claim one to do ticket with Mode Autonomous and hand it to the conductor')
  })
})
