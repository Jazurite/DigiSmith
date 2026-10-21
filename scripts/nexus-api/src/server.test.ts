import { afterEach, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import { API_VERSION } from './version.ts'
import { createApiServer, HOST, parsePort, startNexus } from './server.ts'
import { createLogger } from './logger.ts'
import { defineJob } from './scheduler/registry.ts'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PowerMetrics } from './types.ts'
import { buildReading } from './reading.ts'
import { parsePowermetrics } from './parse-powermetrics.ts'
import { readFileSync } from 'node:fs'

const reading = { readAt: 'x' } as unknown as PowerMetrics
let server: ReturnType<typeof createApiServer> | undefined
afterEach(async () => { if (server) await new Promise(r => server!.close(r)); server = undefined })

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
  it('the response body starts with verdict, then the raw fields', async () => {
    const parsed = parsePowermetrics(readFileSync(new URL('./fixtures/powermetrics-real-sample.txt', import.meta.url), 'utf8'))
    const live = { anyOk: true, load: { cpuIdlePct: 85, load1: 3, load5: 3, load15: 3 }, memory: { freePct: 74 }, topProcesses: [], opencodeServer: { port: 4198, rssMb: null } }
    const { base } = await start(async () => buildReading(Date.now(), { status: 'ok', value: parsed, at: Date.now() }, live))
    const text = await (await fetch(base + PATH)).text()
    expect(text.startsWith('{"verdict":{"status":"ok"')).toBe(true)
    const body = JSON.parse(text)
    expect(Object.keys(body).slice(0, 2)).toEqual(['verdict', 'readAt'])
    expect(body.verdict).toEqual({ status: 'ok', summary: 'The Mac is fine: cool, not throttling, plenty of memory.', reasons: [] })
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
  it('parsePort accepts a valid port, defaults when unset, and refuses nonsense', () => {
    expect(parsePort(undefined)).toBe(4300)
    expect(parsePort('4311')).toBe(4311)
    for (const bad of ['abc', '0', '70000', '-1', '4300.5', '']) expect(() => parsePort(bad)).toThrow()
  })
})

describe('startNexus', () => {
  const dg = { file: '/nonexistent/dg', args: [] }
  const testJobs = [defineJob({ name: 'test-only', description: 'never runs here', command: { file: process.execPath, args: ['-e', ''] } })]
  async function boot(dir: string) {
    const lines: string[] = []
    const nexus = await startNexus({ getReading: async () => reading, logger: createLogger(l => lines.push(l)), stateDir: dir, dg, jobs: testJobs })
    server = nexus.server
    await new Promise<void>(r => server!.listen(0, HOST, r))
    const { port } = server.address() as AddressInfo
    return { nexus, lines, base: `http://127.0.0.1:${port}` }
  }

  it('a state folder that cannot be made disables only the scheduler', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'nexus-start-'))
    try {
      const file = join(tmp, 'plain-file')
      writeFileSync(file, 'x')
      const { nexus, lines, base } = await boot(join(file, 'scheduler'))
      expect(nexus.scheduler).toBe(false)
      expect(lines.map(l => JSON.parse(l))).toEqual([expect.objectContaining({ level: 'error', msg: 'scheduler_error', where: 'start', code: 'ENOTDIR' })])
      const r = await fetch(base + PATH)
      expect(r.status).toBe(200)
      expect(await r.json()).toEqual(reading)
      const jobs = await fetch(`${base}/api/${API_VERSION}/jobs`)
      expect(jobs.status).toBe(404)
      await expect(nexus.stop()).resolves.toBeUndefined()
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('a good state folder serves the jobs routes', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'nexus-start-'))
    try {
      const { nexus, lines, base } = await boot(join(tmp, 'scheduler'))
      expect(nexus.scheduler).toBe(true)
      expect(lines).toEqual([])
      const jobs = await fetch(`${base}/api/${API_VERSION}/jobs`)
      expect(jobs.status).toBe(200)
      expect((await jobs.json()).jobs.map((j: { name: string }) => j.name)).toEqual(['test-only'])
      // no job in the list points at the real dg entry point
      for (const j of testJobs) expect(j.command.args.join(' ')).not.toContain('.digismith-depot')
      await nexus.stop()
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
