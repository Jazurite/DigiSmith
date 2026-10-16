import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { parsePowermetrics } from './parse-powermetrics.ts'
import { buildReading } from './reading.ts'
import { createApiServer, HOST } from './server.ts'
import type { PowerMetrics } from './types.ts'

const NOW = 1_792_000_000_000
const parsed = parsePowermetrics(readFileSync(new URL('./fixtures/powermetrics-real-sample.txt', import.meta.url), 'utf8'))
const live = { anyOk: true, load: { cpuIdlePct: 85, load1: 3, load5: 3, load15: 3 }, memory: { freePct: 74 }, topProcesses: [], opencodeServer: { port: 4198, rssMb: null } }
const reading = buildReading(NOW, { status: 'ok', value: parsed, at: NOW - 2000 }, live) as PowerMetrics

let server: ReturnType<typeof createApiServer> | undefined
afterEach(async () => { if (server) await new Promise(r => server!.close(r)); server = undefined })
async function start(get: () => Promise<PowerMetrics | null>) {
  server = createApiServer(get)
  await new Promise<void>(r => server!.listen(0, HOST, r))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}
const PATH = '/api/v1/power-metrics'

describe('the Hono app keeps the old power-metrics behaviour', () => {
  it('sends exactly the bytes the old server sent', async () => {
    const base = await start(async () => reading)
    const text = await (await fetch(base + PATH)).text()
    expect(text).toBe(readFileSync(new URL('./fixtures/power-metrics-old-response.json', import.meta.url), 'utf8'))
  })
  it('keeps the old headers on 200', async () => {
    const base = await start(async () => reading)
    const r = await fetch(base + PATH)
    expect(r.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(r.headers.get('cache-control')).toBe('no-store')
  })
  it('HEAD still gets 405 with Allow: GET', async () => {
    const base = await start(async () => reading)
    const r = await fetch(base + PATH, { method: 'HEAD' })
    expect(r.status).toBe(405)
    expect(r.headers.get('allow')).toBe('GET')
  })
  it('POST gets 405 with the old body', async () => {
    const base = await start(async () => reading)
    const r = await fetch(base + PATH, { method: 'POST' })
    expect(r.status).toBe(405)
    expect(await r.json()).toEqual({ error: 'method_not_allowed' })
  })
  it('a trailing slash and a different letter case are still 404 with the old body', async () => {
    const base = await start(async () => reading)
    for (const p of [PATH + '/', '/API/v1/power-metrics']) {
      const r = await fetch(base + p)
      expect(r.status).toBe(404)
      expect(await r.json()).toEqual({ error: 'not_found' })
      expect(r.headers.get('cache-control')).toBe('no-store')
    }
  })
  it('503 no_reading keeps Retry-After and the old body', async () => {
    const base = await start(async () => null)
    const r = await fetch(base + PATH)
    expect(r.status).toBe(503)
    expect(r.headers.get('retry-after')).toBe('5')
    expect(await r.json()).toEqual({ error: 'no_reading', message: 'no reading could be built' })
  })
  it('a malformed escape in the path does not crash the server', async () => {
    const base = await start(async () => reading)
    const r = await fetch(base + '/%E0%A4%A')
    expect([400, 404]).toContain(r.status)
    expect((await fetch(base + PATH)).status).toBe(200)
  })
})
