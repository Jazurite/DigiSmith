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
})
