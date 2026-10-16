import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { createGzip } from 'node:zlib'
import type { AddressInfo } from 'node:net'
import { extname, join, normalize } from 'node:path'
import { getRequestListener } from '@hono/node-server'
import { buildApp } from '../../../nexus-api/src/app.ts'
import type { Profile } from '../../../nexus-api/src/profile-crypto.ts'

export type Mode = 'ok' | 'before' | 'past' | 'locked' | 'empty' | 'down'
const NOW = Date.parse('2026-10-16T14:00:00Z')   // 21:00 on 2026-10-16 in UTC+7
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' }
// fake profiles only: no real date is ever in a test
const LOADERS: Record<Mode, () => Promise<Profile>> = {
  ok: async () => ({ birthDate: '1990-01-01', lifeYears: 90 }),
  before: async () => ({ birthDate: '2030-01-01', lifeYears: 90 }),
  past: async () => ({ birthDate: '1900-01-01', lifeYears: 90 }),
  locked: async () => { throw { code: 'key_unavailable' } },
  empty: async () => { throw { code: 'profile_missing' } },
  down: async () => { throw new Error('boom') },
}

export async function startStub(opts: { dir: string; port?: number }) {
  let mode: Mode = 'ok'
  const app = buildApp(async () => null, { loadProfile: () => LOADERS[mode](), now: () => NOW })
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
