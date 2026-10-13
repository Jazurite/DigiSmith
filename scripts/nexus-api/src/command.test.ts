import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { POWERMETRICS, POWERMETRICS_ARGS, SAMPLERS, SOURCE_TIMEOUT_MS, SUDO_ARGS, sudoersLine } from './command.ts'

describe('the one fixed powermetrics command', () => {
  it('is exactly sudo -n /usr/bin/powermetrics --samplers <list> -i 1000 -n 1', () => {
    expect(SUDO_ARGS).toEqual(['-n', '/usr/bin/powermetrics', '--samplers', SAMPLERS.join(','), '-i', '1000', '-n', '1'])
  })
  it('covers thermal, SMC, CPU power, GPU, tasks, disk, network and battery, and not interrupts', () => {
    for (const s of ['thermal', 'smc', 'cpu_power', 'gpu_power', 'tasks', 'disk', 'network', 'battery']) expect(SAMPLERS).toContain(s)
    expect(SAMPLERS).not.toContain('interrupts')
  })
  it('has a timeout well above the 1 s sample and below a stuck run', () => {
    expect(SOURCE_TIMEOUT_MS).toBeGreaterThanOrEqual(5000)
    expect(SOURCE_TIMEOUT_MS).toBeLessThanOrEqual(15000)
  })
  it('sudoers line matches the command word for word, commas escaped', () => {
    const line = sudoersLine('workbox')
    expect(line).toBe(`workbox ALL=(root) NOPASSWD: ${POWERMETRICS} --samplers ${SAMPLERS.join('\\,')} -i 1000 -n 1`)
    expect(line.replace(/\\,/g, ',').split('NOPASSWD: ')[1].split(' ')).toEqual([POWERMETRICS, ...POWERMETRICS_ARGS])
  })
  it('refuses a user name that could add a second rule', () => {
    expect(() => sudoersLine('workbox ALL=(ALL) NOPASSWD: ALL #')).toThrow()
    expect(() => sudoersLine('')).toThrow()
  })
  it('passes visudo -cf (syntax check, no root needed)', () => {
    if (spawnSync('visudo', ['-V']).error) return
    const f = join(mkdtempSync(join(tmpdir(), 'sudoers-')), 'rule')
    writeFileSync(f, sudoersLine('workbox') + '\n')
    const r = spawnSync('visudo', ['-cf', f], { encoding: 'utf8' })
    expect(r.stdout + r.stderr).toContain('parsed OK')
  })
})
