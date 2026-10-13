import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parsePowermetrics } from './parse-powermetrics.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const real = readFileSync(join(HERE, 'fixtures/powermetrics-real-sample.txt'), 'utf8')   // real: 2026-10-08, samplers smc,cpu_power,thermal,tasks
const extra = readFileSync(join(HERE, 'fixtures/powermetrics-extra-synthetic.txt'), 'utf8') // SYNTHETIC network/disk/battery sections

describe('parsePowermetrics on the real sample', () => {
  const p = parsePowermetrics(real)
  it('reads the header', () => {
    expect(p.machine).toEqual({ model: 'MacBookPro16,1', osBuild: '25G241' })
    expect(p.sampleElapsedMs).toBe(2018.22)
  })
  it('reads SMC and thermal fields', () => {
    expect(p.thermal).toEqual({
      cpuDieTempC: 50.33, gpuDieTempC: 44, fanRpm: 1832.09, pressure: 'Nominal',
      cpuThermalLevel: 0, gpuThermalLevel: 0, ioThermalLevel: 0, cpuPlimit: 0, gpuPlimit: 0, prochots: 0,
    })
  })
  it('reads CPU power and frequency', () => {
    expect(p.power.packagePowerW).toBe(1.65)
    expect(p.cpu.avgFrequencyMhz).toBe(1718.91)
    expect(p.cpu.avgFrequencyPctOfNominal).toBe(66.11)
    expect(p.cpu.packageCStateResidencyPct).toBe(73.83)
    expect(p.cpu.coresActivePct).toBe(22.95)
    expect(p.cpu.avgCoresActive).toBe(0.32)
    expect(p.cpu.gpuActivePct).toBe(0)
    expect(p.cpu.performanceLimitedDueTo).toBe('CPU LIMIT MAX_TURBO_LIMIT')
    expect(p.cpu.perCpuFrequencyMhz).toHaveLength(12)
    expect(p.cpu.perCpuFrequencyMhz[0]).toBe(1689.52)
  })
  it('reads the top tasks by CPU, without powermetrics itself', () => {
    expect(p.topTasks).toHaveLength(5)
    expect(p.topTasks[0]).toEqual({ name: 'WindowServer', pid: 206, cpuMsPerS: 159.77, userPct: 81.22 })
    expect(p.topTasks.map(t => t.name)).not.toContain('powermetrics')
    const cpu = p.topTasks.map(t => t.cpuMsPerS)
    expect([...cpu].sort((a, b) => b - a)).toEqual(cpu)
  })
  it('has no extra sections when none were sampled', () => {
    expect(p.extraSections).toEqual([])
  })
})

describe('parsePowermetrics on the real default-samplers run (Jack\'s J1, 2026-10-13 17:56)', () => {
  const p = parsePowermetrics(readFileSync(join(HERE, 'fixtures/powermetrics-default-real.txt'), 'utf8'))
  it('reads the typed fields', () => {
    expect(p.sampleElapsedMs).toBe(1033.18)
    expect(p.power.packagePowerW).toBe(8.97)
    expect(p.cpu.perCpuFrequencyMhz).toHaveLength(12)
    expect(p.thermal).toMatchObject({ cpuDieTempC: 59.07, gpuDieTempC: 48, fanRpm: 1843.65, prochots: 0, pressure: null })   // pressure: the thermal sampler is not in the default set
    expect(p.topTasks).toHaveLength(5)
    expect(p.topTasks[0].cpuMsPerS).toBeGreaterThanOrEqual(p.topTasks[4].cpuMsPerS)
  })
  it('keeps battery, network, disk, GPU and AGPM sections raw, and drops the interrupt table', () => {
    const titles = p.extraSections.map(s => s.title)
    expect(titles).toEqual(expect.arrayContaining(['Battery and backlight usage', 'Network activity', 'Disk activity', 'GPU usage', 'AGPM Stats']))
    expect(titles.some(t => /interrupt/i.test(t))).toBe(false)
    expect(p.extraSections.find(s => s.title === 'Disk activity')!.lines).toEqual(['read: 4.84 ops/s 47.57 KBytes/s', 'write: 8.71 ops/s 79.29 KBytes/s'])
  })
  it('caps every raw line at 300 characters', () => {
    for (const s of p.extraSections) for (const l of s.lines) expect(l.length).toBeLessThanOrEqual(300)
  })
})

describe('parsePowermetrics tolerance', () => {
  it('keeps unknown sections (disk, network, battery) as raw lines, capped', () => {
    const p = parsePowermetrics(real + extra)
    expect(p.extraSections.map(s => s.title)).toEqual(['Network activity', 'Disk activity', 'Battery and backlight usage'])
    expect(p.extraSections[0].lines).toEqual(['in:  12.50 packets/s, 3400.00 bytes/s', 'out: 9.00 packets/s, 1200.00 bytes/s'])
    const big = '\n**** Disk activity ****\n' + Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n')
    expect(parsePowermetrics(real + big).extraSections[0].lines).toHaveLength(40)
  })
  it('uses the last sample when several are present', () => {
    const second = real.replace('Fan: 1832.09 rpm', 'Fan: 2000.00 rpm')
    expect(parsePowermetrics(real + '\n' + second).thermal.fanRpm).toBe(2000)
  })
  it('a missing label gives null for that field only', () => {
    const p = parsePowermetrics(real.replace(/^Fan:.*$/m, ''))
    expect(p.thermal.fanRpm).toBeNull()
    expect(p.thermal.cpuDieTempC).toBe(50.33)
  })
  it('throws when the text has no powermetrics sections at all', () => {
    expect(() => parsePowermetrics('')).toThrow()
    expect(() => parsePowermetrics('sudo: a password is required')).toThrow()
  })
  it('a task name with spaces is kept whole', () => {
    const t = real.replace('WindowServer                       206 ', 'Google Chrome Helper              206 ')
    expect(parsePowermetrics(t).topTasks[0].name).toBe('Google Chrome Helper')
  })
})
