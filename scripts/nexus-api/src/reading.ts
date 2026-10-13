import type { LiveReadings } from './live.ts'
import type { Parsed } from './parse-powermetrics.ts'
import type { Outcome } from './source.ts'
import type { PowerMetrics } from './types.ts'

const iso = (ms: number) => new Date(ms).toISOString()
const utc7 = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().replace('T', ' ').slice(0, 19)

const EMPTY: Pick<PowerMetrics, 'machine' | 'power' | 'cpu' | 'thermal' | 'topTasks' | 'extraSections'> = {
  machine: { model: null, osBuild: null },
  power: { packagePowerW: null },
  cpu: { avgFrequencyMhz: null, avgFrequencyPctOfNominal: null, packageCStateResidencyPct: null, coresActivePct: null, avgCoresActive: null, gpuActivePct: null, performanceLimitedDueTo: null, perCpuFrequencyMhz: [] },
  thermal: { cpuDieTempC: null, gpuDieTempC: null, fanRpm: null, pressure: null, cpuThermalLevel: null, gpuThermalLevel: null, ioThermalLevel: null, cpuPlimit: null, gpuPlimit: null, prochots: null },
  topTasks: [],
  extraSections: [],
}

// null only when nothing at all could be read (HTTP 503).
export function buildReading(now: number, source: Outcome<Parsed>, live: LiveReadings): PowerMetrics | null {
  if (source.status !== 'ok' && !live.anyOk) return null
  const root = source.status === 'ok' ? source.value : EMPTY
  return {
    readAt: iso(now),
    readAtUtc7: utc7(now),
    source: source.status === 'ok'
      ? { status: 'ok', readAt: iso(source.at), ageSeconds: Math.max(0, Math.round((now - source.at) / 1000)) }
      : { status: source.status, readAt: null, ageSeconds: null },
    machine: root.machine, power: root.power, cpu: root.cpu, thermal: root.thermal, topTasks: root.topTasks, extraSections: root.extraSections,
    load: live.load, memory: live.memory, opencodeServer: live.opencodeServer, topProcesses: live.topProcesses,
  }
}
