import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { appendRun, readRuns, readState, writeState, stateDir } from './runlog.ts'
import { formatUtc7 } from './clock.ts'
import type { RunRecord } from './types.ts'

const rec = (over: Partial<RunRecord> = {}): RunRecord => {
  const startedAt = over.startedAt ?? '2026-10-18T16:00:00.000Z'
  const ms = Date.parse(startedAt)
  return {
    id: 'r1', job: 'selftest', trigger: 'manual', slot: null, status: 'ok',
    startedAt, startedAtUtc7: formatUtc7(ms), endedAt: startedAt, durationMs: 5, exitCode: 0, detail: 'x',
    ...over,
  }
}

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runlog-')) })

describe('stateDir', () => {
  it('uses NEXUS_STATE_DIR, else the depot default', () => {
    expect(stateDir({ NEXUS_STATE_DIR: '/x/y' })).toBe('/x/y')
    expect(stateDir({})).toBe(path.join(os.homedir(), '.digismith-depot', 'nexus', 'scheduler'))
  })
})

describe('appendRun', () => {
  it('writes one valid JSON line per run', async () => {
    await appendRun(dir, rec({ id: 'a' }))
    await appendRun(dir, rec({ id: 'b' }))
    const lines = fs.readFileSync(path.join(dir, 'runs-2026-10.jsonl'), 'utf8').split('\n')
    expect(lines.pop()).toBe('')
    expect(lines.map((l) => JSON.parse(l).id)).toEqual(['a', 'b'])
  })
  it('picks the month in UTC+7', async () => {
    await appendRun(dir, rec({ startedAt: '2026-10-31T17:30:00Z' }))
    expect(fs.readdirSync(dir)).toEqual(['runs-2026-11.jsonl'])
  })
  it('a month change opens a new file and leaves the old one untouched', async () => {
    await appendRun(dir, rec({ id: 'old', startedAt: '2026-10-31T16:59:00Z' }))
    const file = path.join(dir, 'runs-2026-10.jsonl')
    const before = fs.readFileSync(file, 'utf8')
    await appendRun(dir, rec({ id: 'new', startedAt: '2026-10-31T17:00:00Z' }))
    expect(fs.readFileSync(file, 'utf8')).toBe(before)
    expect(fs.existsSync(path.join(dir, 'runs-2026-11.jsonl'))).toBe(true)
  })
  it('caps detail to 2000 characters, keeping the tail', async () => {
    await appendRun(dir, rec({ detail: 'a'.repeat(3000) + 'END' }))
    const [r] = await readRuns(dir, { limit: 1 })
    expect(r.detail.length).toBe(2000)
    expect(r.detail.endsWith('END')).toBe(true)
  })
})

describe('readRuns', () => {
  it('reads newest first with a limit across two files', async () => {
    await appendRun(dir, rec({ id: 'o1', startedAt: '2026-10-10T00:00:00Z' }))
    await appendRun(dir, rec({ id: 'o2', startedAt: '2026-10-11T00:00:00Z' }))
    await appendRun(dir, rec({ id: 'n1', startedAt: '2026-11-10T00:00:00Z' }))
    await appendRun(dir, rec({ id: 'n2', startedAt: '2026-11-11T00:00:00Z' }))
    expect((await readRuns(dir, { limit: 3 })).map((r) => r.id)).toEqual(['n2', 'n1', 'o2'])
    expect((await readRuns(dir, { limit: 10 })).map((r) => r.id)).toEqual(['n2', 'n1', 'o2', 'o1'])
  })
  it('filters by job', async () => {
    await appendRun(dir, rec({ id: 'a', job: 'one' }))
    await appendRun(dir, rec({ id: 'b', job: 'two' }))
    await appendRun(dir, rec({ id: 'c', job: 'one' }))
    expect((await readRuns(dir, { job: 'one', limit: 10 })).map((r) => r.id)).toEqual(['c', 'a'])
  })
  it('skips malformed lines and tolerates a missing dir', async () => {
    await appendRun(dir, rec({ id: 'a' }))
    fs.appendFileSync(path.join(dir, 'runs-2026-10.jsonl'), '{broken\n\n')
    expect((await readRuns(dir, { limit: 5 })).map((r) => r.id)).toEqual(['a'])
    expect(await readRuns(path.join(dir, 'nope'), { limit: 5 })).toEqual([])
  })
})

describe('state', () => {
  it('defaults when missing', async () => {
    expect(await readState(dir)).toEqual({ cleanStop: false, inFlight: null, lastSlot: {} })
  })
  it('round-trips, creates the dir, leaves no temp file', async () => {
    const d = path.join(dir, 'deep', 'er')
    const s = { cleanStop: true, inFlight: { job: 'j', startedAt: '2026-10-18T16:00:00Z', pid: 7 }, lastSlot: { j: '2026-10-18@23:00' } }
    await writeState(d, s)
    expect(await readState(d)).toEqual(s)
    expect(fs.readdirSync(d)).toEqual(['state.json'])
  })
  it('cleanStop is false at start and true on stop', async () => {
    await writeState(dir, { cleanStop: false, inFlight: null, lastSlot: {} })
    expect((await readState(dir)).cleanStop).toBe(false)
    await writeState(dir, { cleanStop: true, inFlight: null, lastSlot: {} })
    expect((await readState(dir)).cleanStop).toBe(true)
  })
  it('never reads a partial temp file', async () => {
    await writeState(dir, { cleanStop: true, inFlight: null, lastSlot: { a: 'x' } })
    fs.writeFileSync(path.join(dir, 'state.tmp'), '{"cleanStop": fal')
    expect((await readState(dir)).lastSlot).toEqual({ a: 'x' })
    fs.rmSync(path.join(dir, 'state.json'))
    expect(await readState(dir)).toEqual({ cleanStop: false, inFlight: null, lastSlot: {} })
  })
  it('a corrupt state.json reads as unclean and never throws', async () => {
    fs.writeFileSync(path.join(dir, 'state.json'), '{not json')
    expect(await readState(dir)).toEqual({ cleanStop: false, inFlight: null, lastSlot: {} })
    fs.writeFileSync(path.join(dir, 'state.json'), '[1,2]')
    expect((await readState(dir)).cleanStop).toBe(false)
  })
})
