import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createEngine, type EngineEvent } from './engine.ts'
import { defineJob, type JobInput } from './registry.ts'
import { appendRun, readRuns, readState, writeState, type State } from './runlog.ts'
import type { RunCommand, RunOptions, RunResult } from './runner.ts'
import type { RunRecord } from './types.ts'

const at = (s: string): number => Date.parse(s.replace(' ', 'T') + '+07:00')

const job = (name: string, over: Partial<JobInput> = {}) =>
  defineJob({ name, description: `${name} job`, command: { file: '/usr/bin/true', args: [] }, ...over })
const flux = (over: Partial<JobInput> = {}) => job('flux', { schedule: { atUtc7: '00:10', windowEndUtc7: '05:00' }, ...over })
const scan = (over: Partial<JobInput> = {}) =>
  job('scan', { schedule: { atUtc7: '23:00', windowEndUtc7: '06:00', everyMinutes: 60 }, ...over })

type Mode = 'ok' | 'failed' | 'hang' | 'throw'
interface Call { command: RunCommand; opts: RunOptions; resolve: (r: RunResult) => void }

function fakeRunner(initial: Mode = 'ok') {
  const calls: Call[] = []
  const r = { mode: initial, calls, run: (command: RunCommand, opts: RunOptions): Promise<RunResult> => {
    if (r.mode === 'throw') throw new Error('runner exploded')
    return new Promise<RunResult>((resolve) => {
      calls.push({ command, opts, resolve })
      opts.onStart?.(4242)
      opts.signal?.addEventListener('abort', () => resolve({ status: 'interrupted', exitCode: null, detail: 'stopped' }))
      if (r.mode === 'ok') resolve({ status: 'ok', exitCode: 0, detail: 'done' })
      if (r.mode === 'failed') resolve({ status: 'failed', exitCode: 1, detail: 'boom' })
    })
  } }
  return r
}

let dir: string
let t: number
const now = () => t
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-')) })

// a fresh log has no lines for the night before the first tick, so the engine logs those slots missed; most tests look from `since`
const lines = async (since = ''): Promise<RunRecord[]> =>
  (await readRuns(dir, { limit: 1000 })).reverse().filter((r) => r.slot === null || r.slot.slice(0, 10) >= since)

function make(jobs: ReturnType<typeof job>[], runner = fakeRunner(), extra: Record<string, unknown> = {}) {
  const events: EngineEvent[] = []
  const engine = createEngine({ jobs, stateDir: dir, now, run: runner.run, notify: async (e) => { events.push(e) }, ...extra })
  return { engine, runner, events }
}

async function tickAt(engine: ReturnType<typeof createEngine>, when: string) {
  t = at(when)
  await engine.tick()
  await engine.whenIdle()
}

describe('scheduled slots', () => {
  it('runs a due slot once', async () => {
    const { engine, runner } = make([flux()])
    await tickAt(engine, '2026-10-19 00:10:05')
    await tickAt(engine, '2026-10-19 00:10:35')
    await tickAt(engine, '2026-10-19 01:00:00')
    expect(runner.calls).toHaveLength(1)
    const [r] = await lines('2026-10-19')
    expect(r).toMatchObject({ job: 'flux', trigger: 'schedule', slot: '2026-10-19@00:10', status: 'ok', exitCode: 0, detail: 'done' })
    expect(r.id).toBe('2026-10-18T17:10:05Z-flux')
    expect(r.startedAtUtc7).toBe('2026-10-19 00:10:05')
    expect((await readState(dir)).lastSlot.flux).toBe('2026-10-19@00:10')
  })

  it('does not run before the slot', async () => {
    const { engine, runner } = make([flux()])
    await tickAt(engine, '2026-10-19 00:09:59')
    expect(runner.calls).toHaveLength(0)
    expect(await lines('2026-10-19')).toEqual([])
  })

  it('does not run after the window', async () => {
    const { engine, runner } = make([flux()])
    await tickAt(engine, '2026-10-19 05:00:00')
    expect(runner.calls).toHaveLength(0)
  })

  it('runs a midnight window at 23:00, 00:00 and 01:00, each slot key once', async () => {
    const { engine, runner } = make([scan()])
    for (const w of ['2026-10-18 23:00:05', '2026-10-18 23:30:00', '2026-10-19 00:00:10', '2026-10-19 00:30:00', '2026-10-19 01:00:20', '2026-10-19 01:00:50'])
      await tickAt(engine, w)
    expect(runner.calls).toHaveLength(3)
    const rs = await lines('2026-10-18')
    expect(rs.map((r) => r.slot)).toEqual(['2026-10-18@23:00', '2026-10-18@00:00', '2026-10-18@01:00'])
    expect(rs.every((r) => r.trigger === 'schedule' && r.status === 'ok')).toBe(true)
  })

  it('runs a missed slot inside the window once as catch-up', async () => {
    const { engine, runner } = make([flux()])
    await tickAt(engine, '2026-10-19 02:00:00')
    await tickAt(engine, '2026-10-19 02:00:30')
    expect(runner.calls).toHaveLength(1)
    expect(await lines('2026-10-19')).toMatchObject([{ trigger: 'catch-up', slot: '2026-10-19@00:10', status: 'ok' }])
  })

  it('after 3 hours down in a repeating window runs one catch-up and logs the older slots skipped', async () => {
    const { engine, runner } = make([scan()])
    await tickAt(engine, '2026-10-18 23:00:05')
    await tickAt(engine, '2026-10-19 03:20:00')
    await tickAt(engine, '2026-10-19 03:20:30')
    expect(runner.calls).toHaveLength(2)
    const rs = await lines('2026-10-18')
    expect(rs.map((r) => [r.slot, r.status, r.trigger, r.detail])).toEqual([
      ['2026-10-18@23:00', 'ok', 'schedule', 'done'],
      ['2026-10-18@00:00', 'skipped', 'catch-up', 'missed'],
      ['2026-10-18@01:00', 'skipped', 'catch-up', 'missed'],
      ['2026-10-18@02:00', 'skipped', 'catch-up', 'missed'],
      ['2026-10-18@03:00', 'ok', 'catch-up', 'done'],
    ])
    expect(new Set(rs.map((r) => r.id)).size).toBe(rs.length)
  })

  it('logs a missed slot after the window as skipped once and runs nothing', async () => {
    const { engine, runner } = make([flux()])
    await tickAt(engine, '2026-10-19 12:00:00')
    await tickAt(engine, '2026-10-19 12:00:30')
    expect(runner.calls).toHaveLength(0)
    expect(await lines('2026-10-19')).toMatchObject([{ slot: '2026-10-19@00:10', status: 'skipped', trigger: 'catch-up', detail: 'missed' }])
  })

  it('logs the unhandled slots of the last two nights missed once, never older', async () => {
    const { engine, runner } = make([flux()])
    await tickAt(engine, '2026-10-19 12:00:00')
    await tickAt(engine, '2026-10-19 12:00:30')
    expect(runner.calls).toHaveLength(0)
    expect((await lines()).map((r) => [r.slot, r.detail])).toEqual([['2026-10-18@00:10', 'missed'], ['2026-10-19@00:10', 'missed']])
  })

  it('logs a slot reached while the job still runs as skipped busy', async () => {
    const { engine, runner } = make([scan()], fakeRunner('hang'))
    t = at('2026-10-18 23:00:05')
    await engine.tick()
    t = at('2026-10-19 00:00:05')
    await engine.tick()
    expect(runner.calls).toHaveLength(1)
    expect(await lines('2026-10-18')).toMatchObject([{ slot: '2026-10-18@00:00', status: 'skipped', detail: 'busy' }])
    runner.calls[0].resolve({ status: 'ok', exitCode: 0, detail: 'done' })
    await engine.whenIdle()
    await tickAt(engine, '2026-10-19 00:00:35')
    expect(runner.calls).toHaveLength(1)
  })

  it("never catches up with catchUp 'skip'", async () => {
    const { engine, runner } = make([flux({ catchUp: 'skip' })])
    await tickAt(engine, '2026-10-19 02:00:00')
    expect(runner.calls).toHaveLength(0)
    expect(await lines('2026-10-19')).toMatchObject([{ slot: '2026-10-19@00:10', status: 'skipped', detail: 'missed' }])
    await tickAt(engine, '2026-10-20 00:10:05')
    expect(runner.calls).toHaveLength(1)
  })
})

describe('restart', () => {
  it('does not run a slot twice after a restart', async () => {
    const a = make([flux()])
    await tickAt(a.engine, '2026-10-19 00:10:05')
    const b = make([flux()])
    await tickAt(b.engine, '2026-10-19 00:11:00')
    expect(a.runner.calls.length + b.runner.calls.length).toBe(1)
  })

  it('treats the slot in lastSlot as handled without a log line', async () => {
    await writeState(dir, { cleanStop: true, inFlight: null, lastSlot: { flux: '2026-10-19@00:10' } })
    const { engine, runner } = make([flux()])
    await tickAt(engine, '2026-10-19 00:11:00')
    expect(runner.calls).toHaveLength(0)
  })

  it('treats a slot with a log line as handled without lastSlot', async () => {
    await appendRun(dir, { id: 'x', job: 'flux', trigger: 'schedule', slot: '2026-10-19@00:10', status: 'ok', startedAt: '2026-10-18T17:10:05Z',
      startedAtUtc7: '2026-10-19 00:10:05', endedAt: '2026-10-18T17:10:06Z', durationMs: 1000, exitCode: 0, detail: '' })
    const { engine, runner } = make([flux()])
    await tickAt(engine, '2026-10-19 00:11:00')
    expect(runner.calls).toHaveLength(0)
  })
})

describe('overlap', () => {
  it('refuses a second run of the same job', async () => {
    const { engine } = make([flux()], fakeRunner('hang'))
    t = at('2026-10-19 12:00:00')
    expect(engine.runNow('flux')).toMatchObject({ accepted: true })
    expect(engine.runNow('flux')).toMatchObject({ accepted: false, error: 'already_running' })
  })

  it('runs two jobs due together one after the other, lower order first', async () => {
    const a = job('a', { schedule: { atUtc7: '00:10', windowEndUtc7: '05:00' }, order: 200 })
    const b = job('b', { schedule: { atUtc7: '00:10', windowEndUtc7: '05:00' }, order: 50 })
    const { engine, runner } = make([a, b], fakeRunner('hang'))
    t = at('2026-10-19 00:10:05')
    await engine.tick()
    expect(runner.calls).toHaveLength(1)
    expect(engine.runNow('a')).toMatchObject({ accepted: false, error: 'already_running' })
    runner.calls[0].resolve({ status: 'ok', exitCode: 0, detail: 'b done' })
    await new Promise((r) => setTimeout(r, 20))
    expect(runner.calls).toHaveLength(2)
    runner.calls[1].resolve({ status: 'ok', exitCode: 0, detail: 'a done' })
    await engine.whenIdle()
    expect((await lines('2026-10-19')).map((r) => [r.job, r.slot])).toEqual([['b', '2026-10-19@00:10'], ['a', '2026-10-19@00:10']])
  })
})

describe('runNow', () => {
  it('ignores the window and uses no slot', async () => {
    const { engine, runner } = make([flux()])
    t = at('2026-10-19 12:00:03')
    const res = engine.runNow('flux')
    expect(res).toEqual({ accepted: true, runId: '2026-10-19T05:00:03Z-flux', startedAt: '2026-10-19T05:00:03Z' })
    await engine.whenIdle()
    expect(runner.calls).toHaveLength(1)
    expect(await lines()).toMatchObject([{ id: '2026-10-19T05:00:03Z-flux', trigger: 'manual', slot: null, status: 'ok' }])
  })

  it("refuses outside the window with manualOutsideWindow 'refused' and names the window", async () => {
    const { engine, runner } = make([flux({ manualOutsideWindow: 'refused' })])
    t = at('2026-10-19 12:00:00')
    const res = engine.runNow('flux')
    expect(res).toMatchObject({ accepted: false, error: 'forbidden' })
    expect((res as { message: string }).message).toMatch(/00:10.*05:00/)
    t = at('2026-10-19 01:00:00')
    expect(engine.runNow('flux')).toMatchObject({ accepted: true })
    await engine.whenIdle()
    expect(runner.calls).toHaveLength(1)
  })

  it('answers not_found for an unknown job', () => {
    const { engine } = make([flux()])
    t = at('2026-10-19 12:00:00')
    expect(engine.runNow('nope')).toMatchObject({ accepted: false, error: 'not_found' })
  })
})

describe('interrupted runs', () => {
  it('logs the inFlight run interrupted at start after an unclean stop', async () => {
    await writeState(dir, { cleanStop: false, inFlight: { job: 'flux', startedAt: '2026-10-18T17:10:05Z', pid: 99 }, lastSlot: {} })
    const { engine, events } = make([flux()])
    t = at('2026-10-19 12:00:00')
    await engine.start()
    await engine.whenIdle()
    const rs = (await lines()).filter((r) => r.status === 'interrupted')
    expect(rs).toMatchObject([{ id: '2026-10-18T17:10:05Z-flux', job: 'flux', slot: null, status: 'interrupted' }])
    expect(events.some((e) => e.type === 'unclean-start')).toBe(true)
    const s = await readState(dir)
    expect(s.cleanStop).toBe(false)
    expect(s.inFlight).toBeNull()
    await engine.stop()
    expect((await readState(dir)).cleanStop).toBe(true)
  })

  it('ignores an inFlight with wrong field types', async () => {
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ cleanStop: false, inFlight: { job: 5, startedAt: 7, pid: 'x' }, lastSlot: {} }))
    const { engine } = make([flux()])
    t = at('2026-10-19 12:00:00')
    await engine.start()
    await engine.stop()
    expect((await lines()).filter((r) => r.status === 'interrupted')).toEqual([])
  })

  it('logs a running child interrupted at stop and writes the clean-stop mark', async () => {
    const { engine, runner, events } = make([flux()], fakeRunner('hang'))
    t = at('2026-10-19 00:10:05')
    await engine.start()
    expect(runner.calls).toHaveLength(1)
    await new Promise((r) => setTimeout(r, 20))
    expect((await readState(dir)).inFlight).toMatchObject({ job: 'flux', pid: 4242 })
    await engine.stop()
    expect(runner.calls[0].opts.signal?.aborted).toBe(true)
    expect(await lines('2026-10-19')).toMatchObject([{ slot: '2026-10-19@00:10', status: 'interrupted' }])
    expect(await readState(dir)).toMatchObject({ cleanStop: true, inFlight: null })
    expect(events.map((e) => e.type)).toContain('run')
  })
})

describe('containment', () => {
  it('a throwing runner is logged failed and never stops the tick', async () => {
    const runner = fakeRunner('throw')
    const { engine } = make([scan()], runner)
    await tickAt(engine, '2026-10-18 23:00:05')
    runner.mode = 'ok'
    await tickAt(engine, '2026-10-19 00:00:05')
    expect(await lines('2026-10-18')).toMatchObject([
      { slot: '2026-10-18@23:00', status: 'failed', detail: 'runner exploded' },
      { slot: '2026-10-18@00:00', status: 'ok' },
    ])
  })

  it('a throwing notify never stops the engine', async () => {
    const runner = fakeRunner('failed')
    const engine = createEngine({ jobs: [scan()], stateDir: dir, now, run: runner.run, notify: () => { throw new Error('notify down') } })
    await tickAt(engine, '2026-10-18 23:00:05')
    await tickAt(engine, '2026-10-19 00:00:05')
    expect((await lines('2026-10-18')).map((r) => r.status)).toEqual(['failed', 'failed'])
  })

  it("notifies failures, and ok only with notify 'always'", async () => {
    const { engine, events } = make([flux(), job('loud', { schedule: { atUtc7: '00:10', windowEndUtc7: '05:00' }, notify: 'always' })])
    await tickAt(engine, '2026-10-19 00:10:05')
    expect(events.map((e) => e.type === 'run' && e.run.job)).toEqual(['loud'])
  })

  it('serializes state writes so no write is lost', async () => {
    let active = 0
    let maxActive = 0
    const slowWrite = async (d: string, s: State) => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((r) => setTimeout(r, 5))
      await writeState(d, s)
      active--
    }
    const { engine } = make([flux()], fakeRunner('ok'), { writeState: slowWrite })
    t = at('2026-10-19 00:10:05')
    await engine.start()
    await engine.whenIdle()
    await engine.stop()
    expect(maxActive).toBe(1)
    expect(await readState(dir)).toEqual({ cleanStop: true, inFlight: null, lastSlot: { flux: '2026-10-19@00:10' } })
  })
})

describe('snapshot and runs', () => {
  it('shows schedule, next run, running and last run from memory', async () => {
    const { engine, runner } = make([flux(), job('selftest')], fakeRunner('hang'))
    t = at('2026-10-19 00:10:05')
    await engine.tick()
    const [f, s] = engine.snapshot()
    expect(f).toMatchObject({ name: 'flux', description: 'flux job', schedule: { atUtc7: '00:10', windowEndUtc7: '05:00', everyMinutes: null },
      nextRunAt: '2026-10-19T17:10:00Z', nextRunAtUtc7: '2026-10-20 00:10:00', running: { startedAt: '2026-10-18T17:10:05Z', trigger: 'schedule' }, lastRun: { status: 'skipped', slot: '2026-10-18@00:10' } })
    expect(s).toMatchObject({ name: 'selftest', schedule: null, nextRunAt: null, nextRunAtUtc7: null, running: null, lastRun: null })
    runner.calls[0].resolve({ status: 'ok', exitCode: 0, detail: 'done' })
    await engine.whenIdle()
    expect(engine.snapshot()[0]).toMatchObject({ running: null, lastRun: { status: 'ok', slot: '2026-10-19@00:10' } })
    expect(await engine.getRuns('flux', 10)).toMatchObject([{ status: 'ok' }, { status: 'skipped' }])
  })
})
