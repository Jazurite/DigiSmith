import { effectScope } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useNow } from './use-now'

describe('useNow', () => {
  afterEach(() => { vi.useRealTimers() })
  it('moves every interval and stops with its scope', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-22T03:00:00.000Z'))
    const scope = effectScope()
    const now = scope.run(() => useNow(30_000))!
    const start = now.value
    vi.advanceTimersByTime(30_000)
    expect(now.value).toBe(start + 30_000)
    scope.stop()
    vi.advanceTimersByTime(60_000)
    expect(now.value).toBe(start + 30_000)
  })
})
