import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { apiErrorSchema, lifeCalendarSchema } from '../../nexus-shared/life-calendar.ts'
import { createApiServer, HOST } from './server.ts'
import type { Profile } from './profile-crypto.ts'

const FAKE: Profile = { birthDate: '1990-01-01', lifeYears: 90 }   // fake profile
const NOW = Date.parse('2026-10-16T14:00:00Z')                       // 21:00 on 2026-10-16 in UTC+7
const PATH = '/api/v1/life-calendar'

let server: ReturnType<typeof createApiServer> | undefined
afterEach(async () => { if (server) await new Promise(r => server!.close(r)); server = undefined })
async function start(loadProfile?: () => Promise<Profile>) {
  server = createApiServer(async () => null, { loadProfile, now: () => NOW })
  await new Promise<void>(r => server!.listen(0, HOST, r))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

describe('GET /api/v1/life-calendar', () => {
  it('200: the shared schema accepts the body, and the numbers are the mock numbers', async () => {
    const base = await start(async () => FAKE)
    const r = await fetch(base + PATH)
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(r.headers.get('cache-control')).toBe('no-store')
    const body = lifeCalendarSchema.parse(await r.json())
    expect(body.totals).toEqual({ weeksTotal: 4680, weeksLived: 1913, weeksLeft: 2766, percentLived: 40.9 })
    expect(body.current).toEqual({ row: 36, box: 41 })
    expect(body.today).toBe('2026-10-16')
    expect(body.readAtUtc7).toBe('2026-10-16 21:00:00')
  })
  it('the body has no key whose name suggests a birth date', async () => {
    const base = await start(async () => FAKE)
    const text = await (await fetch(base + PATH)).text()
    expect(Object.keys(JSON.parse(text))).toEqual(['readAt', 'readAtUtc7', 'today', 'timezone', 'totals', 'current', 'rows'])
    expect(text).not.toMatch(/birth|born|dob|lifeYears/i)
  })
  it.each([
    ['profile_missing', { code: 'profile_missing' }],
    ['profile_invalid', { code: 'profile_invalid' }],
    ['key_unavailable', { code: 'key_unavailable' }],
    ['internal_invalid', new Error('1990-01-01 should never be shown')],
  ])('503 %s, with Retry-After and a body that holds only the code', async (code, thrown) => {
    const base = await start(async () => { throw thrown })
    const r = await fetch(base + PATH)
    expect(r.status).toBe(503)
    expect(r.headers.get('retry-after')).toBe('5')
    const text = await r.text()
    expect(apiErrorSchema.parse(JSON.parse(text))).toEqual({ error: code })
    expect(text).not.toContain('1990')
  })
  it('503 profile_missing when the server has no profile loader at all', async () => {
    const base = await start(undefined)
    expect((await (await fetch(base + PATH)).json()).error).toBe('profile_missing')
  })
  it('503 internal_invalid when the result fails the shared schema (zero rows)', async () => {
    const base = await start(async () => ({ birthDate: '1990-01-01', lifeYears: 0 }))
    const r = await fetch(base + PATH)
    expect(r.status).toBe(503)
    expect((await r.json()).error).toBe('internal_invalid')
  })
  it('400 bad_request for any query string, and the body does not echo it', async () => {
    const base = await start(async () => FAKE)
    const r = await fetch(base + PATH + '?birth=2000-01-01')
    expect(r.status).toBe(400)
    const text = await r.text()
    expect(JSON.parse(text)).toEqual({ error: 'bad_request' })
    expect(text).not.toContain('2000')
  })
  it('405 for other methods (HEAD too) and 404 for a trailing slash', async () => {
    const base = await start(async () => FAKE)
    for (const method of ['POST', 'PUT', 'DELETE', 'HEAD']) {
      const r = await fetch(base + PATH, { method })
      expect(r.status, method).toBe(405)
      expect(r.headers.get('allow')).toBe('GET')
    }
    expect((await fetch(base + PATH + '/')).status).toBe(404)
  })
})

describe('createProfileLoader', () => {
  it('an existing empty data folder gives profile_missing, and an unreadable one never leaks a path', async () => {
    const { mkdtempSync, mkdirSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { createProfileLoader } = await import('./life-calendar-route.ts')
    const d = mkdtempSync(join(tmpdir(), 'nexus-empty-'))
    const dataDir = join(d, 'db'); mkdirSync(dataDir, { mode: 0o700 })
    const loader = createProfileLoader({ dataDir, getKey: async () => Buffer.alloc(32) })
    await expect(loader()).rejects.toMatchObject({ code: 'profile_missing' })
    await loader.close()
    server = createApiServer(async () => null, { loadProfile: createProfileLoader({ dataDir: join(d, 'absent'), getKey: async () => Buffer.alloc(32) }), now: () => NOW })
    await new Promise<void>(r => server!.listen(0, HOST, r))
    const r = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${PATH}`)
    const text = await r.text()
    expect(r.status).toBe(503)
    expect(JSON.parse(text)).toEqual({ error: 'profile_missing' })
    expect(text).not.toContain(d)
    rmSync(d, { recursive: true, force: true })
  }, 60_000)
})
