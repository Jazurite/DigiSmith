import { effectScope, ref } from 'vue'
import type { EffectScope } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useNow } from './use-now'

const setVisibility = (v: 'visible' | 'hidden'): void => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useNow', () => {
  let scope: EffectScope
  const T0 = '2026-10-22T03:00:00.000Z'
  const setup = <T>(fn: () => T): T => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(T0))
    scope = effectScope()
    return scope.run(fn)!
  }
  afterEach(() => {
    scope.stop()
    vi.useRealTimers()
    vi.restoreAllMocks()
    setVisibility('visible')
  })

  it('moves every 30 s when nothing is running', () => {
    const now = setup(() => useNow())
    const start = now.value
    vi.advanceTimersByTime(29_999)
    expect(now.value).toBe(start)
    vi.advanceTimersByTime(1)
    expect(now.value).toBe(start + 30_000)
  })
  it('moves every second while fast is on and the tab is visible', () => {
    const fast = ref(true)
    const now = setup(() => useNow({ fast }))
    const start = now.value
    vi.advanceTimersByTime(3_000)
    expect(now.value).toBe(start + 3_000)
  })
  it('restarts at once when fast switches on, and goes back to 30 s when it switches off', () => {
    const fast = ref(false)
    const now = setup(() => useNow({ fast }))
    const start = now.value
    vi.advanceTimersByTime(10_000)
    fast.value = true
    expect(now.value).toBe(start + 10_000)
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(1_000)
    expect(now.value).toBe(start + 11_000)
    fast.value = false
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(29_000)
    expect(now.value).toBe(start + 11_000)
    vi.advanceTimersByTime(1_000)
    expect(now.value).toBe(start + 41_000)
  })
  it('falls back to 30 s in a hidden tab and restarts at once when the tab returns', () => {
    const fast = ref(true)
    const now = setup(() => useNow({ fast }))
    const start = now.value
    setVisibility('hidden')
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(5_000)
    expect(now.value).toBe(start)
    vi.advanceTimersByTime(25_000)
    expect(now.value).toBe(start + 30_000)
    setVisibility('visible')
    expect(vi.getTimerCount()).toBe(1)
    expect(now.value).toBe(Date.now())
    vi.advanceTimersByTime(1_000)
    expect(now.value).toBe(start + 31_000)
  })
  it('starts hidden: the first rate is 30 s', () => {
    setVisibility('hidden')
    const now = setup(() => useNow({ fast: ref(true) }))
    const start = now.value
    vi.advanceTimersByTime(29_000)
    expect(now.value).toBe(start)
  })
  it('stops its timer and its listener with the scope', () => {
    const fast = ref(true)
    const now = setup(() => useNow({ fast }))
    const spy = vi.spyOn(document, 'removeEventListener')
    scope.stop()
    expect(vi.getTimerCount()).toBe(0)
    expect(spy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    const stopped = now.value
    setVisibility('visible')
    vi.advanceTimersByTime(60_000)
    expect(now.value).toBe(stopped)
  })
  it('follows a getter for fast', () => {
    const flag = ref(true)
    const now = setup(() => useNow({ fast: () => flag.value }))
    const start = now.value
    vi.advanceTimersByTime(2_000)
    expect(now.value).toBe(start + 2_000)
  })
})
