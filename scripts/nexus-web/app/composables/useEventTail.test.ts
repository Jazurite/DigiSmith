import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eventsFixture } from '../../tests/nightwatch-fixtures'
import { useEventTail } from './useEventTail'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

function fakeApi(total: number) {
  const urls: string[] = []
  const state = { total }
  const fetch = async (u: string | URL | Request) => {
    const url = new URL(String(u))
    urls.push(url.search)
    const since = Number(url.searchParams.get('since') ?? 0)
    const before = url.searchParams.get('before')
    const tail = Number(url.searchParams.get('tail') ?? 1e9)
    let lines = eventsFixture(state.total).lines.filter((l) => l.n > since && (before === null || l.n < Number(before)))
    lines = lines.slice(-tail)
    return new Response(JSON.stringify({ run: 'b-1', total: state.total, from: since, lines }), { status: 200 })
  }
  return { fetch: fetch as typeof globalThis.fetch, urls, state }
}

describe('useEventTail pauses and backs off like the page polls', () => {
  it('does not poll in a hidden tab and loads again when it shows', async () => {
    const api = fakeApi(10)
    let hidden = true
    const spy = vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => (hidden ? 'hidden' : 'visible'))
    const t = useEventTail('b-1', { fetch: api.fetch, base: 'http://h', intervalMs: 10_000 })
    await vi.advanceTimersByTimeAsync(0)
    const before = api.urls.length
    api.state.total = 14
    await vi.advanceTimersByTimeAsync(60_000)
    expect(api.urls.length).toBe(before)
    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(api.urls.length).toBe(before + 1)
    expect(t.lines.value).toHaveLength(14)
    t.stop()
    spy.mockRestore()
  })
  it('waits 30 s after an error', async () => {
    let fail = false
    let calls = 0
    const base = fakeApi(10)
    const fetch = (async (u: string | URL | Request) => { calls++; if (fail) throw new Error('down'); return base.fetch(u) }) as typeof globalThis.fetch
    const t = useEventTail('b-1', { fetch, base: 'http://h', intervalMs: 10_000 })
    await vi.advanceTimersByTimeAsync(0)
    fail = true
    await vi.advanceTimersByTimeAsync(10_000)   // the poll fails
    const n = calls
    await vi.advanceTimersByTimeAsync(29_000)
    expect(calls).toBe(n)
    await vi.advanceTimersByTimeAsync(1_500)
    expect(calls).toBe(n + 1)
    t.stop()
  })
})

describe('useEventTail in-flight guard', () => {
  it('hide then show during a pending poll does not start a second request or duplicate lines', async () => {
    const base = fakeApi(10)
    let release: (() => void) | null = null
    let hold = false
    let calls = 0
    const fetch = (async (u: string | URL | Request) => {
      calls++
      if (hold) await new Promise<void>((r) => { release = r })
      return base.fetch(u)
    }) as typeof globalThis.fetch
    let hidden = false
    const spy = vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => (hidden ? 'hidden' : 'visible'))
    const t = useEventTail('b-1', { fetch, base: 'http://h', intervalMs: 10_000 })
    await vi.advanceTimersByTimeAsync(0)
    base.state.total = 13
    hold = true
    await vi.advanceTimersByTimeAsync(10_000)   // the poll is now pending
    const n = calls
    hidden = true; document.dispatchEvent(new Event('visibilitychange'))
    hidden = false; document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toBe(n)
    hold = false
    release!()
    await vi.advanceTimersByTimeAsync(0)
    expect(t.lines.value.map((l) => l.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
    t.stop()
    spy.mockRestore()
  })
})

describe('useEventTail', () => {
  it('loads the last 200 lines first, then asks only for lines after the line count', async () => {
    const api = fakeApi(300)
    const t = useEventTail('b-1', { fetch: api.fetch, base: 'http://h', intervalMs: 10_000 })
    await vi.advanceTimersByTimeAsync(0)
    expect(api.urls[0]).toBe('?tail=200')
    expect(t.lines.value).toHaveLength(200)
    expect(t.total.value).toBe(300)
    expect(t.hasEarlier.value).toBe(true)
    api.state.total = 303
    await vi.advanceTimersByTimeAsync(10_000)
    expect(api.urls[1]).toBe('?since=300')
    expect(t.lines.value).toHaveLength(203)
    expect(t.lines.value.at(-1)?.n).toBe(303)
  })
  it('does not append while tail is off', async () => {
    const api = fakeApi(10)
    const t = useEventTail('b-1', { fetch: api.fetch, base: 'http://h', intervalMs: 10_000 })
    await vi.advanceTimersByTimeAsync(0)
    t.tail.value = false
    api.state.total = 15
    await vi.advanceTimersByTimeAsync(20_000)
    expect(t.lines.value).toHaveLength(10)
  })
  it('loadEarlier sends before=<smallest n> and prepends', async () => {
    const api = fakeApi(500)
    const t = useEventTail('b-1', { fetch: api.fetch, base: 'http://h', intervalMs: 10_000 })
    await vi.advanceTimersByTimeAsync(0)
    await t.loadEarlier()
    expect(api.urls.at(-1)).toBe('?before=301&tail=200')
    expect(t.lines.value[0]?.n).toBe(101)
    expect(t.lines.value).toHaveLength(400)
  })
  it('a group change reloads with the group and the tail', async () => {
    const api = fakeApi(50)
    const t = useEventTail('b-1', { fetch: api.fetch, base: 'http://h', intervalMs: 10_000 })
    await vi.advanceTimersByTimeAsync(0)
    await t.setGroup('errors')
    expect(api.urls.at(-1)).toBe('?group=errors&tail=200')
  })
  it('under a group filter hasEarlier follows the page size, not the first line number', async () => {
    const api = fakeApi(50)
    const t = useEventTail('b-1', { fetch: api.fetch, base: 'http://h', intervalMs: 10_000 })
    await vi.advanceTimersByTimeAsync(0)
    expect(t.hasEarlier.value).toBe(false)   // 50 lines, all loaded, first n is 1
    const filtered = async (lines: number, first: number) => ({
      fetch: (async () => new Response(JSON.stringify({ run: 'b-1', total: 900, from: 0, lines: eventsFixture(900).lines.slice(first, first + lines) }), { status: 200 })) as typeof globalThis.fetch,
    })
    const few = useEventTail('b-1', { fetch: (await filtered(3, 500)).fetch, base: 'http://h', intervalMs: 10_000 })
    await vi.advanceTimersByTimeAsync(0)
    await few.setGroup('errors')
    expect(few.lines.value[0]?.n).toBeGreaterThan(1)
    expect(few.hasEarlier.value).toBe(false)   // a short filtered page: nothing earlier, although n is above 1
    const full = useEventTail('b-1', { fetch: (await filtered(200, 500)).fetch, base: 'http://h', intervalMs: 10_000 })
    await vi.advanceTimersByTimeAsync(0)
    await full.setGroup('errors')
    expect(full.hasEarlier.value).toBe(true)   // a full filtered page: maybe more
  })
  it('a failed loadEarlier keeps the earlier pages through the next poll and does not set the shared error', async () => {
    const api = fakeApi(500)
    let fail = false
    const flaky = (async (u: string | URL | Request) => (fail && String(u).includes('before=') ? Promise.reject(new TypeError('x')) : api.fetch(u))) as typeof globalThis.fetch
    const t = useEventTail('b-1', { fetch: flaky, base: 'http://h', intervalMs: 10_000 })
    await vi.advanceTimersByTimeAsync(0)
    await t.loadEarlier()
    expect(t.lines.value).toHaveLength(400)
    fail = true
    await t.loadEarlier()
    expect(t.earlierError.value).toBe(true)
    expect(t.error.value).toBe(false)
    api.state.total = 502
    await vi.advanceTimersByTimeAsync(10_000)
    expect(api.urls.at(-1)).toBe('?since=500')
    expect(t.lines.value).toHaveLength(402)
    fail = false
    await t.loadEarlier()
    expect(t.earlierError.value).toBe(false)
    expect(t.lines.value[0]?.n).toBe(1)
  })
})
