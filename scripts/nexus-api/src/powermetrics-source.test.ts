import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPowermetricsSource } from './powermetrics-source.ts'

const real = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/powermetrics-real-sample.txt'), 'utf8')

afterEach(() => { vi.useRealTimers() })

describe('createPowermetricsSource', () => {
  it('parses the output of a run', async () => {
    const r = await createPowermetricsSource(async () => real)()
    expect(r.status === 'ok' && r.value.thermal.cpuDieTempC).toBe(50.33)
  })
  it('sudo without the rule (password required) is a failure, not a crash', async () => {
    const r = await createPowermetricsSource(async () => 'sudo: a password is required')()
    expect(r.status).toBe('failed')
  })
  it('a run that throws is failed', async () => {
    const r = await createPowermetricsSource(async () => { throw new Error('exit 1') })()
    expect(r.status).toBe('failed')
  })
  it('ten concurrent callers share one run', async () => {
    let n = 0
    const get = createPowermetricsSource(async () => { n++; return real })
    await Promise.all(Array.from({ length: 10 }, () => get()))
    expect(n).toBe(1)
  })
  it('a refresh loop cannot stack runs: a second call 4 s later reuses the read, one 6 s later runs again', async () => {
    vi.useFakeTimers()
    try {
      let n = 0
      const get = createPowermetricsSource(async () => { n++; return real })
      await get()
      await vi.advanceTimersByTimeAsync(4000)
      await get()
      expect(n).toBe(1)
      await vi.advanceTimersByTimeAsync(2000)
      await get()
      expect(n).toBe(2)
    } finally { vi.useRealTimers() }
  })
  it('never starts a second run while the previous child is still alive (no pile-up of root processes)', async () => {
    vi.useFakeTimers()
    try {
      let starts = 0
      const get = createPowermetricsSource(() => { starts++; return new Promise<string>(() => {}) })   // a child that ignores the abort
      const p = get()
      await vi.advanceTimersByTimeAsync(10_001)
      expect((await p).status).toBe('timeout')
      await vi.advanceTimersByTimeAsync(5_001)
      const again = await get()
      expect(again.status).toBe('failed')
      expect(starts).toBe(1)
    } finally { vi.useRealTimers() }
  })
})
