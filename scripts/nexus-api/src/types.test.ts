import { describe, expect, it } from 'vitest'
import type { PowerMetrics } from './types.ts'

const base: PowerMetrics = {
  readAt: '2026-10-13T11:02:15.000Z', readAtUtc7: '2026-10-13 18:02:15',
  source: { status: 'ok', readAt: '2026-10-13T11:02:14.000Z', ageSeconds: 1 },
  machine: { model: 'MacBookPro16,1', osBuild: '25G241' },
  power: { packagePowerW: 1.65 },
  cpu: { avgFrequencyMhz: 1718.91, avgFrequencyPctOfNominal: 66.11, packageCStateResidencyPct: 73.83, coresActivePct: 22.95, avgCoresActive: 0.32, gpuActivePct: 0, performanceLimitedDueTo: null, perCpuFrequencyMhz: [1689.52] },
  thermal: { cpuDieTempC: 50.33, gpuDieTempC: 44, fanRpm: 1832.09, pressure: 'Nominal', cpuThermalLevel: 0, gpuThermalLevel: 0, ioThermalLevel: 0, cpuPlimit: 0, gpuPlimit: 0, prochots: 0 },
  topTasks: [{ name: 'WindowServer', pid: 206, cpuMsPerS: 159.77, userPct: 81.22 }],
  extraSections: [{ title: 'Disk activity', lines: ['read: 3.00 ops/s'] }],
  load: { cpuIdlePct: 92.38, load1: 2.87, load5: 3.43, load15: 3.43 },
  memory: { freePct: 77 },
  opencodeServer: { port: 4198, rssMb: 1341 },
  topProcesses: [{ name: 'node', rssMb: 812, cpuPct: 3.1 }],
}
describe('PowerMetrics type', () => {
  it('compiles with all three source statuses', () => {
    for (const status of ['ok', 'failed', 'timeout'] as const) expect({ ...base, source: { ...base.source, status } }.source.status).toBe(status)
  })
})
