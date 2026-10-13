import { describe, expect, it } from 'vitest'
import { FAN_NEAR_MAX_RPM, HOT_C, IDLE_BUSY_BELOW_PCT, MEMORY_LOW_BELOW_PCT, computeVerdict } from './verdict.ts'
import type { PowerMetrics } from './types.ts'

type Reading = Omit<PowerMetrics, 'verdict'>
const base: Reading = {
  readAt: '2026-10-13T11:02:15.000Z', readAtUtc7: '2026-10-13 18:02:15',
  source: { status: 'ok', readAt: '2026-10-13T11:02:14.000Z', ageSeconds: 1 },
  machine: { model: 'MacBookPro16,1', osBuild: '25G241' },
  power: { packagePowerW: 1.65 },
  cpu: { avgFrequencyMhz: 1718, avgFrequencyPctOfNominal: 66, packageCStateResidencyPct: 73, coresActivePct: 22, avgCoresActive: 0.3, gpuActivePct: 0, performanceLimitedDueTo: 'CPU LIMIT MAX_TURBO_LIMIT', perCpuFrequencyMhz: [] },
  thermal: { cpuDieTempC: 55, gpuDieTempC: 45, fanRpm: 1850, pressure: 'Nominal', cpuThermalLevel: 0, gpuThermalLevel: 0, ioThermalLevel: 0, cpuPlimit: 0, gpuPlimit: 0, prochots: 0 },
  topTasks: [], extraSections: [],
  load: { cpuIdlePct: 85, load1: 3, load5: 3, load15: 3 },
  memory: { freePct: 74 },
  opencodeServer: { port: 4198, rssMb: 1 }, topProcesses: [],
}
const with_ = (p: { thermal?: Partial<Reading['thermal']>; cpu?: Partial<Reading['cpu']>; load?: Partial<Reading['load']>; memory?: Partial<Reading['memory']>; source?: Reading['source'] }): Reading => ({
  ...base, thermal: { ...base.thermal, ...p.thermal }, cpu: { ...base.cpu, ...p.cpu }, load: { ...base.load, ...p.load }, memory: { ...base.memory, ...p.memory }, source: p.source ?? base.source,
})
const failed: Reading['source'] = { status: 'failed', readAt: null, ageSeconds: null }

describe('computeVerdict: ok', () => {
  it('a healthy reading, MAX_TURBO_LIMIT and a high load average included, is ok', () => {
    expect(computeVerdict(base)).toEqual({ status: 'ok', summary: 'The Mac is fine: cool, not throttling, plenty of memory.', reasons: [] })
    expect(computeVerdict(with_({ load: { load1: 31, load5: 20, load15: 10 } })).status).toBe('ok')
  })
  it('the 85 C burst with thermal level 35 and pressure Nominal is ok (cpuThermalLevel is not judged)', () => {
    expect(computeVerdict(with_({ thermal: { cpuDieTempC: 85, cpuThermalLevel: 35 } })).status).toBe('ok')
  })
})

describe('computeVerdict: throttling', () => {
  it.each(['Moderate', 'Heavy', 'Trapping', 'heavy'])('thermal pressure %s', pressure => {
    const v = computeVerdict(with_({ thermal: { pressure } }))
    expect(v.status).toBe('throttling')
    expect(v.reasons).toEqual([`The system reports thermal pressure: ${pressure}.`])
    expect(v.summary).toBe('The Mac is slowing itself down to stay safe.')
  })
  it('a null pressure is not judged', () => { expect(computeVerdict(with_({ thermal: { pressure: null } })).status).toBe('ok') })
  it('CPU power limit above 0', () => {
    const v = computeVerdict(with_({ thermal: { cpuPlimit: 12 } }))
    expect(v.status).toBe('throttling'); expect(v.reasons).toEqual(['The chip is being held back by a power limit.'])
  })
  it('GPU power limit above 0 (one sentence when both)', () => {
    expect(computeVerdict(with_({ thermal: { gpuPlimit: 3 } })).status).toBe('throttling')
    expect(computeVerdict(with_({ thermal: { cpuPlimit: 1, gpuPlimit: 1 } })).reasons).toHaveLength(1)
  })
  it('prochots above 0', () => {
    const v = computeVerdict(with_({ thermal: { prochots: 3 } }))
    expect(v.status).toBe('throttling'); expect(v.reasons).toEqual(['The chip has cut its speed to cool down (3 times).'])
    expect(computeVerdict(with_({ thermal: { prochots: 1 } })).reasons).toEqual(['The chip has cut its speed to cool down (1 time).'])
  })
  it.each(['CPU LIMIT THERMAL', 'CPU LIMIT POWER_LIMIT', 'PROCHOT'])('performanceLimitedDueTo "%s" names a real cause', text => {
    const v = computeVerdict(with_({ cpu: { performanceLimitedDueTo: text } }))
    expect(v.status).toBe('throttling'); expect(v.reasons).toEqual([`The chip reports a limit: ${text}.`])
  })
  it('performanceLimitedDueTo MAX_TURBO_LIMIT (every healthy reading) is ok', () => {
    expect(computeVerdict(with_({ cpu: { performanceLimitedDueTo: 'CPU LIMIT MAX_TURBO_LIMIT' } })).status).toBe('ok')
  })
})

describe('computeVerdict: hot (limits are inclusive)', () => {
  it('CPU one step under the limit is ok, at the limit is hot', () => {
    expect(computeVerdict(with_({ thermal: { cpuDieTempC: HOT_C - 0.01 } })).status).toBe('ok')
    const v = computeVerdict(with_({ thermal: { cpuDieTempC: HOT_C } }))
    expect(v.status).toBe('hot'); expect(v.summary).toBe('The Mac is running hot.')
    expect(v.reasons).toEqual(['The CPU is at 90 C; the chip protects itself at 100 C.'])
  })
  it('GPU edge', () => {
    expect(computeVerdict(with_({ thermal: { gpuDieTempC: HOT_C - 0.01 } })).status).toBe('ok')
    expect(computeVerdict(with_({ thermal: { gpuDieTempC: 92.4 } })).reasons).toEqual(['The GPU is at 92 C; the chip protects itself at 100 C.'])
  })
  it('fan edge: 85 % of the real maximum of 5297 rpm', () => {
    expect(FAN_NEAR_MAX_RPM).toBe(4503)
    expect(computeVerdict(with_({ thermal: { fanRpm: FAN_NEAR_MAX_RPM - 1 } })).status).toBe('ok')
    const v = computeVerdict(with_({ thermal: { fanRpm: 5200 } }))
    expect(v.status).toBe('hot'); expect(v.reasons).toEqual(['The fan is at 5200 rpm, close to its maximum.'])
  })
})

describe('computeVerdict: busy (limits are strict)', () => {
  it('memory edge', () => {
    expect(computeVerdict(with_({ memory: { freePct: MEMORY_LOW_BELOW_PCT } })).status).toBe('ok')
    const v = computeVerdict(with_({ memory: { freePct: 12 } }))
    expect(v.status).toBe('busy'); expect(v.summary).toBe('The Mac is working hard but not in trouble.')
    expect(v.reasons).toEqual(['Only 12 % of memory is free.'])
  })
  it('CPU idle edge', () => {
    expect(computeVerdict(with_({ load: { cpuIdlePct: IDLE_BUSY_BELOW_PCT } })).status).toBe('ok')
    const v = computeVerdict(with_({ load: { cpuIdlePct: 15 } }))
    expect(v.status).toBe('busy'); expect(v.reasons).toEqual(['The CPU is only 15 % idle.'])
  })
  it('null live readings are not judged', () => {
    expect(computeVerdict(with_({ load: { cpuIdlePct: null }, memory: { freePct: null } })).status).toBe('ok')
  })
})

describe('computeVerdict: worst wins, one reason per signal', () => {
  it('throttling beats hot beats busy, and every bad signal is listed', () => {
    const v = computeVerdict(with_({ thermal: { prochots: 2, cpuDieTempC: 95 }, memory: { freePct: 5 }, load: { cpuIdlePct: 3 } }))
    expect(v.status).toBe('throttling')
    expect(v.reasons).toEqual(['The chip has cut its speed to cool down (2 times).', 'The CPU is at 95 C; the chip protects itself at 100 C.', 'Only 5 % of memory is free.', 'The CPU is only 3 % idle.'])
  })
  it('hot beats busy', () => { expect(computeVerdict(with_({ thermal: { cpuDieTempC: 91 }, memory: { freePct: 5 } })).status).toBe('hot') })
})

describe('computeVerdict: unknown', () => {
  it.each(['failed', 'timeout'] as const)('%s source with healthy live fields is unknown, never ok', status => {
    const v = computeVerdict({ ...with_({ source: { status, readAt: null, ageSeconds: null } }), thermal: { ...base.thermal, cpuDieTempC: null, pressure: null, fanRpm: null } })
    expect(v).toEqual({ status: 'unknown', summary: "The heat sensors can't be read right now, so this is not certain.", reasons: ['The heat and throttling sensors could not be read.'] })
  })
  it('the live fields still count: low memory gives busy, with the sensor reason too', () => {
    const v = computeVerdict(with_({ source: failed, memory: { freePct: 9 } }))
    expect(v.status).toBe('busy')
    expect(v.reasons).toEqual(['Only 9 % of memory is free.', 'The heat and throttling sensors could not be read.'])
  })
  it('no I in any sentence', () => {
    const v = computeVerdict(with_({ source: failed }))
    expect(JSON.stringify(v)).not.toMatch(/\bI\b/)
  })
})
