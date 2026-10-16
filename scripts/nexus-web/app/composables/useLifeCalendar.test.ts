import { describe, expect, it } from 'vitest'
import { fixture } from '../../tests/fixtures'
import { loadLifeCalendar } from './useLifeCalendar'

const json = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as typeof fetch
const BASE = 'http://localhost'

describe('loadLifeCalendar', () => {
  it('a good body becomes loaded', async () => {
    const data = fixture('2026-10-16')
    expect(await loadLifeCalendar({ base: BASE, fetch: json(200, data) })).toEqual({ kind: 'loaded', data })
  })
  it('a 200 with a wrong shape (an extra birth-date key) becomes error', async () => {
    expect((await loadLifeCalendar({ base: BASE, fetch: json(200, { ...fixture('2026-10-16'), birthDate: '2000-01-01' }) })).kind).toBe('error')
  })
  it('503 key_unavailable becomes locked, 503 profile_missing becomes empty', async () => {
    expect((await loadLifeCalendar({ base: BASE, fetch: json(503, { error: 'key_unavailable' }) })).kind).toBe('locked')
    expect((await loadLifeCalendar({ base: BASE, fetch: json(503, { error: 'profile_missing' }) })).kind).toBe('empty')
  })
  it('any other code, a non-JSON body and a network failure become error', async () => {
    expect((await loadLifeCalendar({ base: BASE, fetch: json(503, { error: 'profile_invalid' }) })).kind).toBe('error')
    expect((await loadLifeCalendar({ base: BASE, fetch: (async () => new Response('<html>', { status: 502 })) as typeof fetch })).kind).toBe('error')
    expect((await loadLifeCalendar({ base: BASE, fetch: (async () => { throw new TypeError('network') }) as typeof fetch })).kind).toBe('error')
  })
})
