import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { createGzip } from 'node:zlib'
import type { AddressInfo } from 'node:net'
import { extname, join, normalize } from 'node:path'
import { getRequestListener } from '@hono/node-server'
import { buildApp } from '../../../nexus-api/src/app.ts'
import type { Profile } from '../../../nexus-api/src/profile-crypto.ts'
import type { JobInfo, RunRecord } from '../../../nexus-api/src/scheduler/types.ts'
import { ReaderError, type Reader } from '../../../nexus-api/src/nightwatch-reader.ts'
import { attentionFixture, eventsFixture, overviewFixture, planFixture, runDetailFixture, runsFixture } from '../nightwatch-fixtures.ts'

export type LifeMode = 'ok' | 'before' | 'past' | 'locked' | 'empty' | 'down'
export type NwMode = 'nw-ok' | 'nw-empty' | 'nw-down' | 'nw-more-attention' | 'nw-unknown'
export type Mode = LifeMode | NwMode
const NOW = Date.parse('2026-10-16T14:00:00Z')   // 21:00 on 2026-10-16 in UTC+7
const NW_NOW = Date.parse('2026-10-22T03:00:00Z')   // the Nightwatch fixture times are on 2026-10-22
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' }
// fake profiles only: no real date is ever in a test
const LOADERS: Record<LifeMode, () => Promise<Profile>> = {
  ok: async () => ({ birthDate: '1990-01-01', lifeYears: 90 }),
  before: async () => ({ birthDate: '2030-01-01', lifeYears: 90 }),
  past: async () => ({ birthDate: '1900-01-01', lifeYears: 90 }),
  locked: async () => { throw { code: 'key_unavailable' } },
  empty: async () => { throw { code: 'profile_missing' } },
  down: async () => { throw new Error('boom') },
}

// Scheduler jobs for the Nexus status: both ran fine a minute ago (healthy), or never ran (unknown).
function nwJobs(mode: Mode): JobInfo[] {
  const info = (name: string, lastRun: RunRecord | null): JobInfo => ({ name, description: name, schedule: null, nextRunAt: null, nextRunAtUtc7: null, running: null, queued: null, lastRun })
  const ran = (job: string): RunRecord => ({ id: `${job}-1`, job, trigger: 'schedule', slot: null, status: 'ok', startedAt: '2026-10-22T02:58:00.000Z', startedAtUtc7: '2026-10-22T09:58:00+07:00', endedAt: '2026-10-22T02:59:00.000Z', durationMs: 60_000, exitCode: 0, detail: '' })
  const never = mode === 'nw-unknown'
  return ['autonomous-scan', 'nightwatch-watchdog'].map((n) => info(n, never ? null : ran(n)))
}

const isNw = (m: Mode): m is NwMode => m.startsWith('nw-')

// A fake Reader: the Task 8 fixtures by view name. The route adds `nexus` to the overview itself.
function nwRead(mode: () => Mode): Reader {
  return async (view, args = {}) => {
    const m = mode()
    if (m === 'nw-down') throw new ReaderError('reader_unavailable')
    const empty = m === 'nw-empty'
    const readAt = overviewFixture().readAt
    switch (view) {
      case 'overview': {
        const { nexus: _nexus, ...rest } = overviewFixture()
        return empty ? { ...rest, workers: [], attentionCount: 0, lastEvents: [] } : rest
      }
      case 'attention': {
        const a = attentionFixture()
        if (empty) return { ...a, open: [], resolved: [] }
        if (m === 'nw-more-attention') return { ...a, open: [...a.open, { ...a.open[0], id: 'att-3', since: '2026-10-22T02:55:00.000Z' }] }
        return a
      }
      case 'runs': {
        const r = runsFixture()
        if (empty) return { readAt, total: 0, runs: [] }
        const runs = r.runs.filter((x) => (!args.state || x.state === args.state) && (!args.role || x.role === args.role) && (!args.ticket || x.ticket === args.ticket) && (!args.trigger || x.trigger === args.trigger))
        return { ...r, total: runs.length, runs: runs.slice(0, Number(args.limit ?? 100)) }
      }
      case 'run': {
        const d = runDetailFixture()
        if (args.run !== d.row.run) throw new ReaderError('not_found')
        return d
      }
      case 'events': {
        const e = eventsFixture(40)
        let lines = e.lines
        if (args.group) lines = lines.filter((l) => (l.groups as string[]).includes(String(args.group)))
        if (args.since !== undefined) lines = lines.filter((l) => l.n > Number(args.since))
        if (args.before !== undefined) lines = lines.filter((l) => l.n < Number(args.before))
        if (args.tail !== undefined) lines = lines.slice(-Number(args.tail))
        return { ...e, lines }
      }
      case 'plan': {
        const p = planFixture()
        return args.ticket === p.ticket ? p : { ticket: String(args.ticket), found: false, planFile: null, tasksTotal: 0, tasksDone: 0, tasks: [], verdicts: [], ledgerError: false }
      }
    }
  }
}

export async function startStub(opts: { dir: string; port?: number }) {
  let mode: Mode = 'ok'
  const read = nwRead(() => mode)
  const life = (): LifeMode => (isNw(mode) ? 'ok' : mode)
  const app = buildApp(async () => null, { loadProfile: () => LOADERS[life()](), now: () => NOW, nightwatch: { read: (v, a) => read(v, a), jobs: () => nwJobs(mode), now: () => NW_NOW } })
  const api = getRequestListener(app.fetch)
  const server = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0]
    if (url.startsWith('/__stub/')) { mode = url.slice('/__stub/'.length) as Mode; res.end('ok'); return }
    if (url.startsWith('/api/')) { api(req, res); return }
    let file = join(opts.dir, normalize(url).replace(/^(\.\.[/\\])+/, ''))
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
    if (!existsSync(file)) { res.writeHead(404); res.end(); return }
    const type = TYPES[extname(file)] ?? 'application/octet-stream'
    // like any real web server, compress the text files: the Lighthouse budgets count transferred bytes
    if (/^(text\/|application\/json|image\/svg)/.test(type) && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) {
      res.writeHead(200, { 'content-type': type, 'content-encoding': 'gzip', vary: 'accept-encoding' })
      createReadStream(file).pipe(createGzip()).pipe(res)
      return
    }
    res.writeHead(200, { 'content-type': type })
    createReadStream(file).pipe(res)
  })
  await new Promise<void>(r => server.listen(opts.port ?? 0, '127.0.0.1', r))
  const port = (server.address() as AddressInfo).port
  return {
    url: `http://127.0.0.1:${port}`,
    async setMode(m: Mode) { await fetch(`http://127.0.0.1:${port}/__stub/${m}`) },
    async close() { await new Promise(r => server.close(r)) },
  }
}

// The same stub over the generated site (`.output/public`), for the Nightwatch gates. Start modes: nw-ok.
export async function startStubForNightwatch() {
  const stub = await startStub({ dir: join(import.meta.dirname, '../../.output/public') })
  await stub.setMode('nw-ok')
  return stub
}
