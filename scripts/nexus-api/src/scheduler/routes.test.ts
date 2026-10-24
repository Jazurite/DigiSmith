import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildApp } from '../app.ts'
import { createLogger } from '../logger.ts'
import { createShutdown } from '../server.ts'
import type { PowerMetrics } from '../types.ts'
import { API_VERSION } from '../version.ts'
import { createEngine, type Engine, type EngineEvent } from './engine.ts'
import { ensureToken } from './guard.ts'
import { defineJob, JOBS } from './registry.ts'
import type { RunCommand, RunOptions, RunResult } from './runner.ts'
import type { JobDef, RunRecord } from './types.ts'

const BASE = `/api/${API_VERSION}/jobs`
const POWER = `/api/${API_VERSION}/power-metrics`
const reading = { readAt: 'x' } as unknown as PowerMetrics
const T0 = Date.UTC(2026, 9, 19, 5, 0, 0)

let dir: string
let engines: Engine[]
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-routes-')); engines = [] })
afterEach(async () => {
  for (const e of engines) await e.stop()
  fs.rmSync(dir, { recursive: true, force: true })
})

type Mode = 'ok' | 'hang' | 'throw'
function fakeRunner(mode: Mode = 'ok') {
  const r = {
    mode, calls: 0, release: (): void => undefined,
    run: (_c: RunCommand, opts: RunOptions): Promise<RunResult> => {
      r.calls++
      if (r.mode === 'throw') throw new Error('runner exploded')
      return new Promise<RunResult>((resolve) => {
        opts.onStart?.(4242)
        opts.signal?.addEventListener('abort', () => resolve({ status: 'interrupted', exitCode: null, detail: 'stopped' }))
        r.release = () => resolve({ status: 'ok', exitCode: 0, detail: 'done' })
        if (r.mode === 'ok') resolve({ status: 'ok', exitCode: 0, detail: 'done' })
      })
    },
  }
  return r
}

const job = (name: string, over: Partial<JobDef> = {}): JobDef =>
  ({ ...defineJob({ name, description: `${name} job`, command: { file: '/usr/bin/true', args: [] } }), ...over })

interface Setup {
  jobs?: readonly JobDef[]; mode?: Mode; notify?: (e: EngineEvent) => Promise<void>
  engine?: Partial<Engine>; getReading?: () => Promise<PowerMetrics | null>
}
function setup(o: Setup = {}) {
  const jobs = o.jobs ?? [job('selftest'), job('other')]
  const runner = fakeRunner(o.mode)
  const real = createEngine({ jobs, stateDir: dir, now: () => T0, run: runner.run as never, ...(o.notify ? { notify: o.notify } : {}) })
  engines.push(real)
  const engine = { ...real, ...o.engine } as Engine
  const token = ensureToken(dir)
  const lines: string[] = []
  const logger = createLogger((l) => lines.push(l), () => 0)
  const app = buildApp(o.getReading ?? (async () => reading), { logger, jobs: { engine, jobs, token, now: () => T0 } })
  const bodies: string[] = []
  const req = async (p: string, init: RequestInit = {}) => {
    const r = await app.request(p, init)
    const text = await r.text()
    bodies.push(text, JSON.stringify([...r.headers]))
    return { status: r.status, headers: r.headers, text, json: () => JSON.parse(text) }
  }
  const post = (name: string, h: Record<string, string> = {}, body: string = JSON.stringify({ confirm: name })) =>
    req(`${BASE}/${name}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Nexus-Token': token, ...h }, body })
  return { app, engine: real, runner, token, lines, bodies, req, post }
}

const expectJsonHeaders = (h: Headers) => {
  expect(h.get('content-type')).toBe('application/json; charset=utf-8')
  expect(h.get('cache-control')).toBe('no-store')
}

describe('GET /jobs', () => {
  it('200 with generatedAt and the engine snapshot', async () => {
    const s = setup()
    const r = await s.req(BASE)
    expect(r.status).toBe(200)
    expectJsonHeaders(r.headers)
    const body = r.json()
    expect(body.generatedAt).toBe(new Date(T0).toISOString())
    expect(body.jobs).toEqual(s.engine.snapshot())
    expect(body.jobs.map((j: { name: string }) => j.name)).toEqual(['selftest', 'other'])
  })

  it('503 internal_invalid when snapshot throws, and power-metrics still answers', async () => {
    const s = setup({ engine: { snapshot: () => { throw new Error('boom') } } })
    const r = await s.req(BASE)
    expect(r.status).toBe(503)
    expect(r.json()).toEqual({ error: 'internal_invalid' })
    expect((await s.req(POWER)).status).toBe(200)
  })

  it('the runner throwing leaves GET /jobs and power-metrics answering', async () => {
    const s = setup({ mode: 'throw' })
    expect((await s.post('selftest')).status).toBe(202)
    await s.engine.whenIdle()
    const r = await s.req(BASE)
    expect(r.status).toBe(200)
    expect(r.json().jobs[0].lastRun.status).toBe('failed')
    expect((await s.req(POWER)).text).toBe(JSON.stringify(reading))
  })

  it('a failing notifier leaves GET /jobs and power-metrics answering', async () => {
    let called = 0
    const s = setup({ mode: 'throw', notify: async () => { called++; throw new Error('dg down') } })
    expect((await s.post('selftest')).status).toBe(202)
    await s.engine.whenIdle()
    await new Promise((r) => setTimeout(r, 10))
    expect(called).toBe(1)
    expect((await s.req(BASE)).status).toBe(200)
    expect((await s.req(POWER)).status).toBe(200)
  })
})

describe('GET /jobs/<name>/runs', () => {
  const rec = (i: number, name = 'selftest'): RunRecord => ({
    id: `r${i}`, job: name, trigger: 'manual', slot: null, status: 'ok',
    startedAt: new Date(T0 + i * 1000).toISOString(), startedAtUtc7: 'x', endedAt: null, durationMs: 1, exitCode: 0, detail: '',
  })
  const seed = (n: number, name?: string) =>
    fs.appendFileSync(path.join(dir, 'runs-2026-10.jsonl'), Array.from({ length: n }, (_, i) => JSON.stringify(rec(i, name)) + '\n').join(''))

  it('200 newest first, default limit 50', async () => {
    const s = setup()
    seed(60); seed(3, 'other')
    const r = await s.req(`${BASE}/selftest/runs`)
    expect(r.status).toBe(200)
    expectJsonHeaders(r.headers)
    const body = r.json()
    expect(body.job).toBe('selftest')
    expect(body.runs).toHaveLength(50)
    expect(body.runs[0].id).toBe('r59')
    expect(body.runs.every((x: RunRecord) => x.job === 'selftest')).toBe(true)
  })

  it('limit=2 and limit=200 work', async () => {
    const s = setup()
    seed(250)
    expect((await s.req(`${BASE}/selftest/runs?limit=2`)).json().runs.map((x: RunRecord) => x.id)).toEqual(['r249', 'r248'])
    expect((await s.req(`${BASE}/selftest/runs?limit=200`)).json().runs).toHaveLength(200)
  })

  it('an empty log gives an empty list', async () => {
    expect((await setup().req(`${BASE}/selftest/runs`)).json()).toEqual({ job: 'selftest', runs: [] })
  })

  it.each(['0', '201', '-1', 'abc', '1.5', '', '10x'])('400 bad_request for limit=%s', async (v) => {
    const r = await setup().req(`${BASE}/selftest/runs?limit=${v}`)
    expect(r.status).toBe(400)
    expect(r.json().error).toBe('bad_request')
  })

  it('404 not_found for an unknown job', async () => {
    const r = await setup().req(`${BASE}/nope/runs`)
    expect(r.status).toBe(404)
    expect(r.json().error).toBe('not_found')
  })

  it('503 when reading the runs throws', async () => {
    const s = setup({ engine: { getRuns: async () => { throw new Error('disk') } } })
    expect((await s.req(`${BASE}/selftest/runs`)).json()).toEqual({ error: 'internal_invalid' })
  })
})

describe('POST /jobs/<name>/run', () => {
  it('202 with the run id and start time, then the run shows in /runs', async () => {
    const s = setup()
    const r = await s.post('selftest')
    expect(r.status).toBe(202)
    expectJsonHeaders(r.headers)
    const body = r.json()
    expect(body).toEqual({ accepted: true, run: { id: expect.any(String), startedAt: new Date(T0).toISOString().replace('.000', '') } })
    await s.engine.whenIdle()
    const runs = (await s.req(`${BASE}/selftest/runs`)).json().runs
    expect(runs[0]).toMatchObject({ id: body.run.id, status: 'ok', trigger: 'manual' })
  })

  it('409 already_running while the job runs', async () => {
    const s = setup({ mode: 'hang' })
    expect((await s.post('selftest')).status).toBe(202)
    const r = await s.post('selftest')
    expect(r.status).toBe(409)
    expect(r.json().error).toBe('already_running')
    s.runner.release()
    await s.engine.whenIdle()
    expect((await s.post('selftest')).status).toBe(202)
  })

  it('404 not_found for an unknown job, before the guard', async () => {
    const s = setup()
    const r = await s.req(`${BASE}/nope/run`, { method: 'POST' })
    expect(r.status).toBe(404)
    expect(r.json().error).toBe('not_found')
  })

  it.each([
    ['no token', { 'X-Nexus-Token': '' }, undefined, 403, 'forbidden'],
    ['a wrong token', { 'X-Nexus-Token': 'f'.repeat(64) }, undefined, 403, 'forbidden'],
    ['a form content type', { 'Content-Type': 'application/x-www-form-urlencoded' }, undefined, 400, 'bad_request'],
    ['text/plain', { 'Content-Type': 'text/plain' }, undefined, 400, 'bad_request'],
    ['a wrong confirm', {}, JSON.stringify({ confirm: 'other' }), 400, 'bad_request'],
    ['no confirm', {}, '{}', 400, 'bad_request'],
    ['a broken body', {}, '{', 400, 'bad_request'],
  ])('%s gives the guard status', async (_n, h, body, status, error) => {
    const s = setup()
    const r = await s.post('selftest', h, body)
    expect(r.status).toBe(status)
    expectJsonHeaders(r.headers)
    expect(r.json()).toEqual({ error, message: expect.any(String) })
    expect(s.runner.calls).toBe(0)
  })

  it('a wrong token gets 403 without the body being read', async () => {
    const s = setup()
    let pulled = 0
    const body = new ReadableStream({ pull(ctrl) { pulled++; if (pulled === 1) ctrl.enqueue(new TextEncoder().encode('{"confirm":')) } })
    const init = { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Nexus-Token': 'nope' }, body, duplex: 'half' } as RequestInit
    const r = await Promise.race([s.app.request(`${BASE}/selftest/run`, init), new Promise<null>((res) => setTimeout(() => res(null), 1000))])
    expect(r?.status).toBe(403)
    const huge = await s.post('selftest', { 'X-Nexus-Token': '' }, 'x'.repeat(5_000_000))
    expect(huge.status).toBe(403)
    expect(s.runner.calls).toBe(0)
  })

  it('403 forbidden when the job refuses run-now outside its window', async () => {
    const flux = job('flux', { schedule: { atUtc7: '00:10', windowEndUtc7: '05:00' }, manualOutsideWindow: 'refused' })
    const r = await setup({ jobs: [flux] }).post('flux')
    expect(r.status).toBe(403)
    expect(r.json().error).toBe('forbidden')
    expect(r.json().message).toContain('00:10')
  })

  it('503 stopped once the engine is stopping', async () => {
    const s = setup()
    await s.engine.stop()
    const r = await s.post('selftest')
    expect(r.status).toBe(503)
    expect(r.json().error).toBe('stopped')
  })

  it('503 internal_invalid when runNow throws', async () => {
    const s = setup({ engine: { runNow: () => { throw new Error('x') } } })
    expect((await s.post('selftest')).json()).toEqual({ error: 'internal_invalid' })
  })
})

describe('methods and paths', () => {
  it.each([
    ['GET', `${BASE}/selftest/run`, 'POST'],
    ['PUT', `${BASE}/selftest/run`, 'POST'],
    ['HEAD', `${BASE}/selftest/run`, 'POST'],
    ['POST', BASE, 'GET'],
    ['DELETE', BASE, 'GET'],
    ['HEAD', BASE, 'GET'],
    ['POST', `${BASE}/selftest/runs`, 'GET'],
    ['HEAD', `${BASE}/selftest/runs`, 'GET'],
    ['OPTIONS', `${BASE}/selftest/runs`, 'GET'],
  ])('%s %s gives 405 with Allow: %s', async (method, p, allow) => {
    const r = await setup().req(p, { method })
    expect(r.status).toBe(405)
    expect(r.headers.get('allow')).toBe(allow)
    expect(r.headers.get('cache-control')).toBe('no-store')
    if (method !== 'HEAD') expect(r.json().error).toBe('method_not_allowed')
  })

  it.each([
    '/api/jobs', '/api/v2/jobs', '/api/v0/jobs/selftest/runs', `${BASE}/`, `${BASE}x`, `${BASE}/selftest`,
    `${BASE}/selftest/runs/extra`, `${BASE}/selftest/run/extra`, `${BASE}/selftest/runsx`, `${BASE}/selftest/other`,
    `/API/${API_VERSION}/jobs`,
  ])('404 not_found for GET %s', async (p) => {
    const r = await setup().req(p)
    expect(r.status).toBe(404)
    expect(r.json().error).toBe('not_found')
    expectJsonHeaders(r.headers)
  })

  it('without the jobs dependency the jobs paths are 404 and power-metrics is unchanged', async () => {
    const app = buildApp(async () => reading)
    expect((await app.request(BASE)).status).toBe(404)
    expect((await app.request(`${BASE}/selftest/run`, { method: 'POST' })).status).toBe(404)
    const r = await app.request(POWER)
    expect(r.status).toBe(200)
    expect(await r.text()).toBe(JSON.stringify(reading))
  })

  it('power-metrics answers exactly as before with the jobs routes mounted', async () => {
    const s = setup()
    const a = await s.req(POWER)
    const b = await buildApp(async () => reading).request(POWER)
    expect(a.status).toBe(b.status)
    expect(a.text).toBe(await b.text())
    expect([...a.headers]).toEqual([...b.headers])
    expect((await s.req(POWER, { method: 'POST' })).status).toBe(405)
  })
})

describe('shutdown', () => {
  it('stops the engine, then closes the server, then exits 0', async () => {
    const order: string[] = []
    const shutdown = createShutdown({
      stop: async () => { order.push('stop') }, close: (done) => { order.push('close'); done() },
      exit: (code) => { order.push(`exit ${code}`) }, onStopError: () => order.push('error'), graceMs: 60_000,
    })
    await shutdown()
    await shutdown()
    expect(order).toEqual(['stop', 'close', 'exit 0'])
  })

  it('a stop that never ends still exits after the grace time', async () => {
    const exits: number[] = []
    let closed = false
    const shutdown = createShutdown({ stop: () => new Promise<void>(() => undefined), close: () => { closed = true }, exit: (c) => { exits.push(c) }, onStopError: () => undefined, graceMs: 50 })
    void shutdown()
    await new Promise((r) => setTimeout(r, 150))
    expect(exits).toEqual([0])
    expect(closed).toBe(false)
  })

  it('a stop that throws is reported and the server still closes', async () => {
    const order: string[] = []
    const shutdown = createShutdown({ stop: async () => { throw new Error('x') }, close: (done) => { order.push('close'); done() }, exit: (c) => { order.push(`exit ${c}`) }, onStopError: () => order.push('error'), graceMs: 60_000 })
    await shutdown()
    expect(order).toEqual(['error', 'close', 'exit 0'])
  })
})

describe('the token never leaves the server', () => {
  it('appears in no log line and no response body or header', async () => {
    const s = setup({ mode: 'hang' })
    await s.req(BASE)
    await s.req(`${BASE}/selftest/runs`)
    await s.post('selftest', { 'X-Nexus-Token': '' })
    await s.post('selftest', { 'X-Nexus-Token': s.token.slice(0, 63) + 'x' })
    await s.post('selftest', { 'Content-Type': 'text/plain' })
    await s.post('selftest', {}, '{"confirm":"nope"}')
    await s.post('selftest')
    await s.post('selftest')
    await s.req(`${BASE}/selftest/run`)
    await s.req(`${BASE}/nope/run`, { method: 'POST', headers: { 'X-Nexus-Token': s.token } })
    await s.req(`${BASE}/selftest/run?token=${s.token}`, { method: 'POST' })
    s.runner.release()
    await s.engine.whenIdle()
    await s.req(BASE)
    expect(s.lines.length).toBeGreaterThanOrEqual(12)
    expect(s.bodies.length).toBeGreaterThanOrEqual(24)
    for (const t of [...s.lines, ...s.bodies]) expect(t.includes(s.token)).toBe(false)
  })
})

describe('the real entry point on a throwaway server', () => {
  const serverTs = fileURLToPath(new URL('../server.ts', import.meta.url))
  let child: ChildProcess | undefined
  afterEach(() => { if (child && child.exitCode === null) child.kill('SIGKILL'); child = undefined })

  it('starts the engine, runs selftest from a separate process with the token file, and stops cleanly', async () => {
    expect(JOBS.map((j) => j.name)).toEqual(['selftest', 'autonomous-scan', 'autonomous-report', 'nightwatch-watchdog', 'schedule-release'])
    const state = path.join(dir, 'state')
    const depot = path.join(dir, 'depot')
    const dgCalls = path.join(dir, 'dg-calls.jsonl')
    const dgFile = path.join(depot, 'repo', 'packages', 'cli', 'src', 'index.ts')
    fs.mkdirSync(path.dirname(dgFile), { recursive: true })
    fs.writeFileSync(dgFile, `import fs from 'node:fs'\nfs.appendFileSync(${JSON.stringify(dgCalls)}, JSON.stringify(process.argv.slice(2)) + '\\n')\n`)
    const port = 43000 + Math.floor(Math.random() * 2000)
    expect(port).not.toBe(4300)
    const base = `http://127.0.0.1:${port}`

    // a test registry: the child never defines a real job, so no hour of the day can start one
    const jobsModule = path.join(dir, 'test-jobs.ts')
    fs.writeFileSync(jobsModule, [
      `import { defineJob } from ${JSON.stringify(fileURLToPath(new URL('./registry.ts', import.meta.url)))}`,
      "export const JOBS = [defineJob({ name: 'selftest', description: 'test', command: { file: process.execPath, args: ['-e', \"process.stdout.write('selftest ok\\\\n')\"] } })]",
    ].join('\n'))
    child = spawn(process.execPath, ['--experimental-strip-types', serverTs], {
      env: { PATH: process.env.PATH, HOME: dir, PORT: String(port), NEXUS_STATE_DIR: state, DIGISMITH_DEPOT: depot, NEXUS_JOBS_MODULE: jobsModule },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    child.stdout!.on('data', (d) => { out += d })
    child.stderr!.on('data', (d) => { out += d })
    await new Promise<void>((resolve, reject) => {
      const t = setInterval(() => { if (out.includes('"listening"')) { clearInterval(t); resolve() } }, 20)
      child!.on('exit', (code) => { clearInterval(t); reject(new Error(`server exited ${code}: ${out}`)) })
    })
    expect(fs.statSync(path.join(state, 'token')).mode & 0o777).toBe(0o600)
    expect(JSON.parse(fs.readFileSync(path.join(state, 'state.json'), 'utf8')).cleanStop).toBe(false)

    const list = await (await fetch(`${base}/api/${API_VERSION}/jobs`)).json()
    expect(list.jobs.map((j: { name: string }) => j.name)).toEqual(['selftest'])
    expect(list.jobs[0]).toMatchObject({ nextRunAt: null, lastRun: null })

    const script = path.join(dir, 'run-now.mjs')
    fs.writeFileSync(script, [
      "import fs from 'node:fs'",
      "const [stateDir, url, withToken] = process.argv.slice(2)",
      "const token = fs.readFileSync(stateDir + '/token', 'utf8').trim()",
      "const headers = { 'Content-Type': 'application/json' }",
      "if (withToken === 'yes') headers['X-Nexus-Token'] = token",
      "const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ confirm: 'selftest' }) })",
      "process.stdout.write(JSON.stringify({ status: r.status, body: await r.json() }))",
    ].join('\n'))
    const runNow = (withToken: 'yes' | 'no') => new Promise<{ status: number; body: { run?: { id: string } } }>((resolve, reject) =>
      execFile(process.execPath, [script, state, `${base}/api/${API_VERSION}/jobs/selftest/run`, withToken], { env: { PATH: process.env.PATH } },
        (err, stdout) => (err ? reject(err) : resolve(JSON.parse(stdout)))))

    const denied = await runNow('no')
    expect(denied.status).toBe(403)
    const ok = await runNow('yes')
    expect(ok.status).toBe(202)

    let runs: RunRecord[] = []
    for (let i = 0; i < 100 && !runs.length; i++) {
      runs = (await (await fetch(`${base}/api/${API_VERSION}/jobs/selftest/runs`)).json()).runs
      if (!runs.length) await new Promise((r) => setTimeout(r, 50))
    }
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ id: ok.body.run!.id, status: 'ok', trigger: 'manual', detail: 'selftest ok\n' })
    expect((await fetch(`${base}${POWER}`, { method: 'POST' })).status).toBe(405)

    const exit = new Promise<number | null>((resolve) => child!.on('exit', (code) => resolve(code)))
    child.kill('SIGTERM')
    expect(await exit).toBe(0)
    expect(JSON.parse(fs.readFileSync(path.join(state, 'state.json'), 'utf8')).cleanStop).toBe(true)
    expect(fs.existsSync(dgCalls)).toBe(false)
    expect(out.includes(fs.readFileSync(path.join(state, 'token'), 'utf8').trim())).toBe(false)
  }, 30_000)
})
