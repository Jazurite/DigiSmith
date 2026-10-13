import type { PowerMetrics, Verdict, VerdictStatus } from './types.ts'

// Limits (DGS-466 design). Temperatures: Intel lists 100 C as the i7-9750H maximum; 85 C in a burst is normal here, so 90 C is "hot".
export const HOT_C = 90
export const CHIP_MAX_C = 100
// This Mac's fan 0 maximum is 5297.4 rpm (SMC key F0Mx, read 2026-10-13); "near maximum" is 85 % of it. Fan 1 tops out at 4905 rpm (F1Mx).
export const FAN_NEAR_MAX_RPM = 4503
export const MEMORY_LOW_BELOW_PCT = 15
export const IDLE_BUSY_BELOW_PCT = 20
// "CPU LIMIT MAX_TURBO_LIMIT" is the chip's normal top speed and shows in every reading; only a thermal, power or prochot cause counts.
const REAL_LIMIT = /thermal|power|prochot|plimit|PL[12](?!\d)/i

const RANK: Record<VerdictStatus, number> = { ok: 0, unknown: 1, busy: 2, hot: 3, throttling: 4 }
const SUMMARY: Record<VerdictStatus, string> = {
  ok: 'The Mac is fine: cool, not throttling, plenty of memory.',
  busy: 'The Mac is working hard but not in trouble.',
  hot: 'The Mac is running hot.',
  throttling: 'The Mac is slowing itself down to stay safe.',
  unknown: "The heat sensors can't be read right now, so this is not certain.",
}
const num = (n: number | null): n is number => n !== null && Number.isFinite(n)

// Pure: the reading without its verdict in, the verdict out. cpuThermalLevel is not judged (35 was seen at 85 C with nothing slowed).
export function computeVerdict(r: Omit<PowerMetrics, 'verdict'>): Verdict {
  const found: Array<{ status: VerdictStatus; reason: string }> = []
  const add = (status: VerdictStatus, reason: string) => found.push({ status, reason })
  const t = r.thermal
  if (t.pressure !== null && t.pressure.toLowerCase() !== 'nominal') add('throttling', `The system reports thermal pressure: ${t.pressure}.`)
  if ((num(t.cpuPlimit) && t.cpuPlimit > 0) || (num(t.gpuPlimit) && t.gpuPlimit > 0)) add('throttling', 'The chip is being held back by a power limit.')
  if (num(t.prochots) && t.prochots > 0) add('throttling', `The chip has cut its speed to cool down (${t.prochots} ${t.prochots === 1 ? 'time' : 'times'}).`)
  const limited = r.cpu.performanceLimitedDueTo
  if (limited !== null && REAL_LIMIT.test(limited)) add('throttling', `The chip reports a limit: ${limited}.`)
  if (num(t.cpuDieTempC) && t.cpuDieTempC >= HOT_C) add('hot', `The CPU is at ${Math.round(t.cpuDieTempC)} C; the chip protects itself at ${CHIP_MAX_C} C.`)
  if (num(t.gpuDieTempC) && t.gpuDieTempC >= HOT_C) add('hot', `The GPU is at ${Math.round(t.gpuDieTempC)} C; the chip protects itself at ${CHIP_MAX_C} C.`)
  if (num(t.fanRpm) && t.fanRpm >= FAN_NEAR_MAX_RPM) add('hot', `The fan is at ${Math.round(t.fanRpm)} rpm, close to its maximum.`)
  if (num(r.memory.freePct) && r.memory.freePct < MEMORY_LOW_BELOW_PCT) add('busy', `Only ${Math.round(r.memory.freePct)} % of memory is free.`)
  if (num(r.load.cpuIdlePct) && r.load.cpuIdlePct < IDLE_BUSY_BELOW_PCT) add('busy', `The CPU is only ${Math.round(r.load.cpuIdlePct)} % idle.`)
  if (r.source.status !== 'ok') add('unknown', 'The heat and throttling sensors could not be read.')
  const status = found.reduce<VerdictStatus>((worst, f) => (RANK[f.status] > RANK[worst] ? f.status : worst), 'ok')
  return { status, summary: SUMMARY[status], reasons: found.map(f => f.reason) }
}
