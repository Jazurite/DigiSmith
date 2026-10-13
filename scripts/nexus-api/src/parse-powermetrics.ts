// Parses `powermetrics` text output (several samplers) into typed fields. Labels proven on this Mac (2026-10-08 real sample, fixtures/).
// A label that is missing gives null for that field only. Sections without typed fields are kept as raw lines in extraSections.
import type { PowerMetrics } from './types.ts'

export type Parsed = Pick<PowerMetrics, 'machine' | 'power' | 'cpu' | 'thermal' | 'topTasks' | 'extraSections'> & { sampleElapsedMs: number | null }

const TYPED_SECTIONS = /^(Running tasks|Processor usage|Thermal pressure|SMC sensors)$/i
const SKIPPED_SECTIONS = /^(Interrupt distribution)$/i   // not sampled; guard against a huge table if ever added
const MAX_EXTRA_SECTIONS = 12
const MAX_EXTRA_LINES = 40
const MAX_LINE_CHARS = 300

const num = (s: string | undefined): number | null => {
  if (s === undefined) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
const first = (text: string, re: RegExp): string | undefined => re.exec(text)?.[1]

interface Section { title: string; lines: string[] }

function lastSample(text: string): string {
  const parts = text.split(/^\*\*\* Sampled system activity/m)
  return parts.length > 1 ? '*** Sampled system activity' + parts[parts.length - 1] : text
}

function sections(sample: string): Section[] {
  const out: Section[] = []
  let cur: Section | null = null
  for (const line of sample.split('\n')) {
    const m = /^\*{3,4} (.+?) \*{3,4}$/.exec(line)
    if (m) {
      const title = m[1].trim()
      cur = title.startsWith('Sampled system activity') ? null : { title, lines: [] }
      if (cur) out.push(cur)
    } else if (cur) cur.lines.push(line)
  }
  return out
}

export function parsePowermetrics(text: string): Parsed {
  const sample = lastSample(text)
  const secs = sections(sample)
  if (secs.length === 0) throw new Error('no powermetrics sections in the output')
  const body = (re: RegExp) => secs.filter(s => re.test(s.title)).map(s => s.lines.join('\n')).join('\n')
  const proc = body(/^Processor usage$/i)
  const smc = body(/^SMC sensors$/i)
  const thermal = body(/^Thermal pressure$/i)
  const tasks = secs.find(s => /^Running tasks$/i.test(s.title))

  // one line per logical CPU, in CPU order, right after that CPU's "duty cycles" line
  const perCpu = [...proc.matchAll(/^CPU Average frequency as fraction of nominal: [\d.]+% \(([\d.]+) Mhz\)/gm)].map(m => Number(m[1]))

  const topTasks: Parsed['topTasks'] = []
  for (const line of tasks?.lines ?? []) {
    const m = /^(.+?)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s*$/.exec(line)
    if (!m || m[1] === 'ALL_TASKS' || m[1] === 'powermetrics' || m[1] === 'sudo') continue
    topTasks.push({ name: m[1], pid: Number(m[2]), cpuMsPerS: Number(m[3]), userPct: Number(m[4]) })
  }
  topTasks.sort((a, b) => b.cpuMsPerS - a.cpuMsPerS)

  const extraSections = secs
    .filter(s => !TYPED_SECTIONS.test(s.title) && !SKIPPED_SECTIONS.test(s.title))
    .slice(0, MAX_EXTRA_SECTIONS)
    .map(s => ({ title: s.title, lines: s.lines.map(l => l.trimEnd().slice(0, MAX_LINE_CHARS)).filter(l => l.trim() !== '').slice(0, MAX_EXTRA_LINES) }))

  if (!smc && !proc && !thermal && !tasks) throw new Error('no known powermetrics sections in the output')

  return {
    sampleElapsedMs: num(first(sample, /\(([\d.]+)ms elapsed\)/)),
    machine: { model: first(text, /^Machine model: (.+)$/m)?.trim() ?? null, osBuild: first(text, /^OS version: (.+)$/m)?.trim() ?? null },
    power: { packagePowerW: num(first(proc, /package power \(CPUs\+GT\+SA\): ([\d.]+)W/)) },
    cpu: {
      avgFrequencyMhz: num(first(proc, /^System Average frequency as fraction of nominal: [\d.]+% \(([\d.]+) Mhz\)/m)),
      avgFrequencyPctOfNominal: num(first(proc, /^System Average frequency as fraction of nominal: ([\d.]+)%/m)),
      packageCStateResidencyPct: num(first(proc, /^Package 0 C-state residency: ([\d.]+)%/m)),
      coresActivePct: num(first(proc, /^Cores Active: ([\d.]+)%/m)),
      avgCoresActive: num(first(proc, /^Avg Num of Cores Active: ([\d.]+)/m)),
      gpuActivePct: num(first(proc, /^GPU Active: ([\d.]+)%/m)),
      performanceLimitedDueTo: first(proc, /^Performance Limited Due to:\n(.+)$/m)?.trim() ?? null,
      perCpuFrequencyMhz: perCpu,
    },
    thermal: {
      cpuDieTempC: num(first(smc, /^CPU die temperature: (-?[\d.]+) C/m)),
      gpuDieTempC: num(first(smc, /^GPU die temperature: (-?[\d.]+) C/m)),
      fanRpm: num(first(smc, /^Fan: ([\d.]+) rpm/m)),
      pressure: first(thermal, /^Current pressure level: (.+)$/m)?.trim() ?? null,
      cpuThermalLevel: num(first(smc, /^CPU Thermal level: (-?\d+)/m)),
      gpuThermalLevel: num(first(smc, /^GPU Thermal level: (-?\d+)/m)),
      ioThermalLevel: num(first(smc, /^IO Thermal level: (-?\d+)/m)),
      cpuPlimit: num(first(smc, /^CPU Plimit: ([\d.]+)/m)),
      gpuPlimit: num(first(smc, /^GPU Plimit \(Int\): ([\d.]+)/m)),
      prochots: num(first(smc, /^Number of prochots: (\d+)/m)),
    },
    topTasks: topTasks.slice(0, 5),
    extraSections,
  }
}
