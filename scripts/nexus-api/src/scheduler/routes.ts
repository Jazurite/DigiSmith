import { Hono } from 'hono'
import type { Context } from 'hono'
import { sendJson, type Env } from '../app.ts'
import { API_VERSION } from '../version.ts'
import type { Engine } from './engine.ts'
import { checkRunNow } from './guard.ts'
import type { JobDef, JobsError, JobsResponse, RunNowResponse, RunsResponse } from './types.ts'

export const JOBS_PATH = `/api/${API_VERSION}/jobs` as const

export interface JobsDeps {
  engine: Pick<Engine, 'snapshot' | 'runNow' | 'getRuns'>
  jobs: readonly JobDef[]
  token: string
  now?: () => number
}

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
const STATUS = { not_found: 404, already_running: 409, forbidden: 403, stopped: 503 } as const

const fail = (c: Context<Env>, status: 400 | 403 | 404 | 405 | 409 | 503, error: JobsError['error'], message: string, headers: Record<string, string> = {}) =>
  sendJson(c, status, { error, message } satisfies JobsError, headers)
const internal = (c: Context<Env>) => sendJson(c, 503, { error: 'internal_invalid' })
// Hono runs HEAD through the GET route with c.req.method still HEAD, so HEAD gets 405 like the other routes.
const wrongMethod = (c: Context<Env>, allow: 'GET' | 'POST') =>
  c.req.method === allow ? null : fail(c, 405, 'method_not_allowed', `use ${allow}`, { Allow: allow })

export function createJobsRoutes(deps: JobsDeps): Hono<Env> {
  const { engine, token } = deps
  const now = deps.now ?? Date.now
  const names = new Set(deps.jobs.map((j) => j.name))
  const unknown = (c: Context<Env>, name: string) => (names.has(name) ? null : fail(c, 404, 'not_found', `no job named ${name}`))
  const app = new Hono<Env>()

  app.all(JOBS_PATH, (c) => {
    const bad = wrongMethod(c, 'GET')
    if (bad) return bad
    try {
      const body: JobsResponse = { generatedAt: new Date(now()).toISOString(), jobs: engine.snapshot() }
      return sendJson(c, 200, body)
    } catch {
      return internal(c)
    }
  })

  app.all(`${JOBS_PATH}/:name/runs`, async (c) => {
    const name = c.req.param('name')
    const stop = unknown(c, name) ?? wrongMethod(c, 'GET')
    if (stop) return stop
    const raw = c.req.query('limit')
    const limit = raw === undefined ? DEFAULT_LIMIT : /^\d{1,3}$/.test(raw) ? Number(raw) : NaN
    if (!(limit >= 1 && limit <= MAX_LIMIT)) return fail(c, 400, 'bad_request', `limit must be a whole number from 1 to ${MAX_LIMIT}`)
    try {
      const body: RunsResponse = { job: name, runs: await engine.getRuns(name, limit) }
      return sendJson(c, 200, body)
    } catch {
      return internal(c)
    }
  })

  app.all(`${JOBS_PATH}/:name/run`, async (c) => {
    const name = c.req.param('name')
    const stop = unknown(c, name) ?? wrongMethod(c, 'POST')
    if (stop) return stop
    try {
      const guard = checkRunNow({ contentType: c.req.header('content-type'), tokenHeader: c.req.header('x-nexus-token'), body: await c.req.text() }, token, name)
      if (!guard.ok) return fail(c, guard.status, guard.error, guard.message)
      const r = engine.runNow(name)
      if (!r.accepted) return fail(c, STATUS[r.error], r.error, r.message)
      const body: RunNowResponse = { accepted: true, run: { id: r.runId, startedAt: r.startedAt } }
      return sendJson(c, 202, body)
    } catch {
      return internal(c)
    }
  })

  return app
}
