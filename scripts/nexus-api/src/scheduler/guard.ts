import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export interface RunNowInput {
  contentType: string | undefined
  tokenHeader: string | undefined
  body: unknown
}

export type GuardResult =
  | { ok: true }
  | { ok: false, status: 400 | 403, error: 'bad_request' | 'forbidden', message: string }

function readToken(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8').trim() || null
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}

// The token is written to a temp file first so a crash never leaves an empty token visible.
export function ensureToken(stateDir: string): string {
  fs.mkdirSync(stateDir, { recursive: true })
  const file = path.join(stateDir, 'token')
  let token = readToken(file)
  if (!token) {
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
    fs.writeFileSync(tmp, crypto.randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 })
    try {
      if (fs.existsSync(file)) fs.renameSync(tmp, file)
      else fs.linkSync(tmp, file)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
    } finally {
      fs.rmSync(tmp, { force: true })
    }
    token = readToken(file)
    if (!token) throw new Error('token file unreadable')
  }
  fs.chmodSync(file, 0o600)
  return token
}

function tokenMatches(given: string | undefined, token: string): boolean {
  if (!given) return false
  const a = crypto.createHash('sha256').update(given).digest()
  const b = crypto.createHash('sha256').update(token).digest()
  return crypto.timingSafeEqual(a, b)
}

const forbidden: GuardResult = { ok: false, status: 403, error: 'forbidden', message: 'token missing or wrong' }
const bad = (message: string): GuardResult => ({ ok: false, status: 400, error: 'bad_request', message })

// Order: token first, so a cross-site form post (no token) ends 403 before any other check.
export function checkRunNow(input: RunNowInput, token: string, jobName: string): GuardResult {
  if (!tokenMatches(input.tokenHeader, token)) return forbidden
  const type = (input.contentType ?? '').split(';')[0].trim().toLowerCase()
  if (type !== 'application/json') return bad('content type must be application/json')
  let body: unknown = input.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { return bad('body must be JSON') }
  }
  if (typeof body !== 'object' || body === null) return bad('body must be a JSON object')
  if ((body as { confirm?: unknown }).confirm !== jobName) return bad('confirm must equal the job name')
  return { ok: true }
}
