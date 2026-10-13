import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSingleFlight } from './source.ts'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-13T11:00:00Z')) })
afterEach(() => { vi.useRealTimers() })

const opts = { ttlMs: 5000, timeoutMs: 10000 }

describe('createSingleFlight', () => {
  it('runs once for ten concurrent callers', async () => {
    let calls = 0
    const get = createSingleFlight(async () => { calls++; await new Promise(r => setTimeout(r, 1000)); return 'x' }, opts)
    const all = Promise.all(Array.from({ length: 10 }, () => get()))
    await vi.advanceTimersByTimeAsync(1000)
    const results = await all
    expect(calls).toBe(1)
    expect(results.every(r => r.status === 'ok' && r.value === 'x')).toBe(true)
  })
  it('reuses the result for 5 s, then runs again', async () => {
    let calls = 0
    const get = createSingleFlight(async () => ++calls, opts)
    await get()
    await vi.advanceTimersByTimeAsync(4900)
    await get()
    expect(calls).toBe(1)
    await vi.advanceTimersByTimeAsync(200)
    const r = await get()
    expect(calls).toBe(2)
    expect(r.status === 'ok' && r.value).toBe(2)
  })
  it('a failure is cached too and does not start a new run within 5 s', async () => {
    let calls = 0
    const get = createSingleFlight(async () => { calls++; throw new Error('boom') }, opts)
    expect((await get()).status).toBe('failed')
    await vi.advanceTimersByTimeAsync(3000)
    expect((await get()).status).toBe('failed')
    expect(calls).toBe(1)
    await vi.advanceTimersByTimeAsync(2100)
    await get()
    expect(calls).toBe(2)
  })
  it('times out after timeoutMs and aborts the run', async () => {
    let aborted = false
    const get = createSingleFlight((signal: AbortSignal) => new Promise<string>(() => { signal.addEventListener('abort', () => { aborted = true }) }), opts)
    const p = get()
    await vi.advanceTimersByTimeAsync(9999)
    let done = false
    void p.then(() => { done = true })
    await vi.advanceTimersByTimeAsync(0)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(2)
    expect((await p).status).toBe('timeout')
    expect(aborted).toBe(true)
  })
  it('reports the time of the read in at', async () => {
    const get = createSingleFlight(async () => 1, opts)
    const r = await get()
    expect(r.at).toBe(Date.now())
  })
})
