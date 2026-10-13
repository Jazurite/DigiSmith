import { afterEach, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import { API_VERSION } from './version.ts'
import { createApiServer, HOST } from './server.ts'
import type { PowerMetrics } from './types.ts'

const reading = { readAt: 'x' } as unknown as PowerMetrics
let server: ReturnType<typeof createApiServer> | undefined
afterEach(async () => { await new Promise(r => server?.close(r)); server = undefined })

async function start(get: () => Promise<PowerMetrics | null>) {
  server = createApiServer(get)
  await new Promise<void>(r => server!.listen(0, HOST, r))
  const { address, port } = server.address() as AddressInfo
  return { address, base: `http://127.0.0.1:${port}` }
}
const PATH = `/api/${API_VERSION}/power-metrics`

describe('server', () => {
  it('binds 127.0.0.1 only', async () => {
    expect((await start(async () => reading)).address).toBe('127.0.0.1')
  })
  it('GET the metrics path answers 200 JSON, no-store', async () => {
    const { base } = await start(async () => reading)
    const r = await fetch(base + PATH)
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(await r.json()).toEqual(reading)
  })
  it('503 no_reading with Retry-After when nothing can be read', async () => {
    const { base } = await start(async () => null)
    const r = await fetch(base + PATH)
    expect(r.status).toBe(503)
    expect(r.headers.get('retry-after')).toBe('5')
    expect((await r.json()).error).toBe('no_reading')
  })
  it('503 too when building the reading throws', async () => {
    const { base } = await start(async () => { throw new Error('x') })
    expect((await fetch(base + PATH)).status).toBe(503)
  })
  it('405 for other methods, with Allow: GET', async () => {
    const { base } = await start(async () => reading)
    const r = await fetch(base + PATH, { method: 'POST' })
    expect(r.status).toBe(405)
    expect(r.headers.get('allow')).toBe('GET')
  })
  it.each(['/', '/api/power-metrics', '/api/v0/power-metrics', `/api/${API_VERSION}/other`, `${PATH}/extra`, '/api'])('404 for %s', async p => {
    const { base } = await start(async () => reading)
    expect((await fetch(base + p)).status).toBe(404)
  })
  it('ignores the query string', async () => {
    const { base } = await start(async () => reading)
    expect((await fetch(base + PATH + '?x=1')).status).toBe(200)
  })
  it('20 parallel requests call the reader 20 times but it is the reader that shares work', async () => {
    let n = 0
    const { base } = await start(async () => { n++; return reading })
    await Promise.all(Array.from({ length: 20 }, () => fetch(base + PATH)))
    expect(n).toBe(20)
  })
})
