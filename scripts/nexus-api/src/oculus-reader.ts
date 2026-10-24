// scripts/nexus-api/src/oculus-reader.ts
import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

const MAIN_CHECKOUT = join(homedir(), 'Workspace', 'Jazurite', 'DigiSmith')
export const DEFAULT_ENTRY = join(MAIN_CHECKOUT, 'packages', 'cli', 'dist', 'index.js')

// The flags `dg oculus view` accepts (packages/cli/src/oculus/index.ts VALUE_FLAGS).
const ALLOWED_KEYS = new Set(['run', 'ticket', 'since', 'before', 'tail', 'group', 'state', 'role', 'trigger', 'project', 'limit'])

export type ViewName = 'overview' | 'attention' | 'runs' | 'run' | 'events' | 'plan' | 'live'
export type ViewArgs = Record<string, string | number | undefined>
export type Reader = (view: ViewName, args?: ViewArgs) => Promise<unknown>

export class ReaderError extends Error {
  code: 'reader_unavailable' | 'not_found'
  constructor(code: 'reader_unavailable' | 'not_found') { super(code); this.code = code }
}

export interface ReaderOptions { file?: string; entry?: string; ttlMs?: number; timeoutMs?: number; maxEntries?: number; now?: () => number; env?: NodeJS.ProcessEnv }

// The CLI is the only reader of the run files: no second parser here. Each call is one node process, so the cache
// and the single flight keep ten polling tabs at one spawn per view per 5 s.
export function createReader(opts: ReaderOptions = {}): Reader {
  const file = opts.file ?? process.execPath
  const entry = opts.entry ?? DEFAULT_ENTRY
  const ttl = opts.ttlMs ?? 5_000
  const timeout = opts.timeoutMs ?? 8_000
  const max = opts.maxEntries ?? 200
  const now = opts.now ?? Date.now
  const cache = new Map<string, { at: number; value: unknown }>()
  const inflight = new Map<string, Promise<unknown>>()

  const run = (view: ViewName, args: ViewArgs): Promise<unknown> =>
    new Promise((resolve, reject) => {
      // API boundary: only known flags, only plain values, one `--key=value` item each. The error never echoes input.
      for (const [k, v] of Object.entries(args)) {
        if (v === undefined) continue
        if (!ALLOWED_KEYS.has(k) || (typeof v !== 'string' && typeof v !== 'number') || String(v).startsWith('-')) return reject(new ReaderError('reader_unavailable'))
      }
      const argv = [entry, 'oculus', 'view', view]
      for (const k of Object.keys(args).sort()) {
        const v = args[k]
        if (v !== undefined) argv.push(`--${k}=${String(v)}`)
      }
      execFile(file, argv, { timeout: timeout, killSignal: 'SIGKILL', maxBuffer: 8 * 1024 * 1024, env: opts.env ?? process.env, shell: false }, (err, stdout, stderr) => {
        if (err) {
          const code = (err as { code?: unknown }).code
          return reject(new ReaderError(code === 1 && stderr.trim() === 'not found' ? 'not_found' : 'reader_unavailable'))
        }
        try { resolve(JSON.parse(stdout)) } catch { reject(new ReaderError('reader_unavailable')) }
      })
    })

  // Make room for one entry: drop expired entries first, then the oldest (Map keeps insertion order).
  const evict = (): void => {
    if (cache.size < max) return
    for (const [k, e] of cache) if (now() - e.at >= ttl) cache.delete(k)
    while (cache.size >= max) cache.delete(cache.keys().next().value as string)
  }

  return (view, args = {}) => {
    const key = `${view}|${JSON.stringify(Object.entries(args).filter(([, v]) => v !== undefined).sort())}`
    const hit = cache.get(key)
    if (hit && now() - hit.at < ttl) return Promise.resolve(hit.value)
    const flying = inflight.get(key)
    if (flying) return flying
    const p = run(view, args).then(
      (value) => { evict(); cache.set(key, { at: now(), value }); inflight.delete(key); return value },
      (e) => { inflight.delete(key); throw e },
    )
    inflight.set(key, p)
    return p
  }
}
