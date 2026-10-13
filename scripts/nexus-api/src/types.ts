// The JSON of GET /api/<version>/power-metrics. Copy this type into the front-end.
export type SourceStatus = 'ok' | 'failed' | 'timeout'

export interface PowerMetrics {
  readAt: string              // ISO UTC, when the API answered
  readAtUtc7: string          // same moment, "2026-10-13 18:02:15"
  source: {                   // the powermetrics read behind machine/power/cpu/thermal/topTasks/extraSections
    status: SourceStatus      // ok | failed (sudo or parse error) | timeout
    readAt: string | null     // when powermetrics was read (null unless ok)
    ageSeconds: number | null // 0..5: a cached read is reused for up to 5 s (null unless ok)
  }
  // From powermetrics: all null / empty unless source.status === 'ok'
  machine: { model: string | null; osBuild: string | null }
  power: { packagePowerW: number | null }                  // Intel energy model package power (CPUs + GT + SA)
  cpu: {
    avgFrequencyMhz: number | null
    avgFrequencyPctOfNominal: number | null
    packageCStateResidencyPct: number | null
    coresActivePct: number | null
    avgCoresActive: number | null
    gpuActivePct: number | null
    performanceLimitedDueTo: string | null                 // e.g. "CPU LIMIT MAX_TURBO_LIMIT"
    perCpuFrequencyMhz: number[]                           // one entry per logical CPU
  }
  thermal: {
    cpuDieTempC: number | null
    gpuDieTempC: number | null
    fanRpm: number | null
    pressure: string | null                                // "Nominal" | "Moderate" | "Heavy" | ...
    cpuThermalLevel: number | null
    gpuThermalLevel: number | null
    ioThermalLevel: number | null
    cpuPlimit: number | null
    gpuPlimit: number | null
    prochots: number | null
  }
  topTasks: Array<{ name: string; pid: number; cpuMsPerS: number; userPct: number }>   // top 5 by CPU ms/s
  // Sections the parser has no typed fields for yet (disk, network, battery, GPU ...), raw lines, at most 12 sections of 40 lines
  extraSections: Array<{ title: string; lines: string[] }>
  // No root; read by the API (cached 5 s)
  load: { cpuIdlePct: number | null; load1: number | null; load5: number | null; load15: number | null }
  memory: { freePct: number | null }
  opencodeServer: { port: number; rssMb: number | null }   // rssMb null when nothing listens on 4198
  topProcesses: Array<{ name: string; rssMb: number; cpuPct: number }>                  // top 5 by RSS
}

export interface ApiError { error: 'no_reading'; message: string }   // HTTP 503
