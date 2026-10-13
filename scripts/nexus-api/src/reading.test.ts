import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parsePowermetrics } from './parse-powermetrics.ts'
import { buildReading } from './reading.ts'
import type { LiveReadings } from './live.ts'
import type { Outcome } from './source.ts'
import type { Parsed } from './parse-powermetrics.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const parsed = parsePowermetrics(readFileSync(join(HERE, 'fixtures/powermetrics-real-sample.txt'), 'utf8'))
const NOW = Date.parse('2026-10-13T11:02:15Z')
const live = (anyOk = true): LiveReadings => ({
  anyOk,
  load: { cpuIdlePct: 92.6, load1: 1, load5: 2, load15: 3 }, memory: { freePct: 77 },
  topProcesses: [{ name: 'node', rssMb: 812, cpuPct: 3.1 }], opencodeServer: { port: 4198, rssMb: 1341 },
})

describe('buildReading', () => {
  it('ok source: fills thermal and the rest, source block with age', () => {
    const src: Outcome<Parsed> = { status: 'ok', value: parsed, at: NOW - 3000 }
    const r = buildReading(NOW, src, live())!
    expect(r.readAt).toBe('2026-10-13T11:02:15.000Z')
    expect(r.readAtUtc7).toBe('2026-10-13 18:02:15')
    expect(r.source).toEqual({ status: 'ok', readAt: '2026-10-13T11:02:12.000Z', ageSeconds: 3 })
    expect(r.thermal.cpuDieTempC).toBe(50.33)
    expect(r.cpu.perCpuFrequencyMhz).toHaveLength(12)
    expect(r.topTasks).toHaveLength(5)
    expect(r.load.load1).toBe(1)
  })
  it.each(['failed', 'timeout'] as const)('%s source: 200-style reading with null root fields', status => {
    const r = buildReading(NOW, { status, at: NOW }, live())!
    expect(r.source).toEqual({ status, readAt: null, ageSeconds: null })
    expect(r.thermal.cpuDieTempC).toBeNull()
    expect(r.thermal.prochots).toBeNull()
    expect(r.cpu.perCpuFrequencyMhz).toEqual([])
    expect(r.topTasks).toEqual([])
    expect(r.extraSections).toEqual([])
    expect(r.memory.freePct).toBe(77)
  })
  it('null when nothing at all could be read', () => {
    expect(buildReading(NOW, { status: 'failed', at: NOW }, live(false))).toBeNull()
  })
})
