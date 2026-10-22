// scripts/nexus-api/src/nightwatch-route.ts
import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { attentionSchema, eventsSchema, overviewViewSchema, planSchema, runDetailSchema, runsSchema, EVENT_GROUPS, HEALTH, ROLES, TRIGGERS } from '../../nexus-shared/nightwatch.ts'
import { sendJson, type Env } from './app.ts'
import { ReaderError, type Reader, type ViewArgs, type ViewName } from './nightwatch-reader.ts'
import type { JobInfo } from './scheduler/types.ts'
import { API_VERSION } from './version.ts'

export const NIGHTWATCH_PATH = `/api/${API_VERSION}/nightwatch` as const

export interface NightwatchDeps { read: Reader; jobs?: () => JobInfo[]; now?: () => number }

const WATCHDOG_STALE_MS = 15 * 60_000
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export function nexusStatus(jobs: JobInfo[] | null, breakerOpen: boolean, nowMs: number): { status: 'healthy' | 'degraded' | 'breaker-open'; reasons: string[] } {
  if (breakerOpen) return { status: 'breaker-open', reasons: ['circuit breaker open'] }
  if (jobs === null) return { status: 'degraded', reasons: ['scheduler off'] }
  const reasons: string[] = []
  for (const name of ['autonomous-scan', 'nightwatch-watchdog']) {
    const last = jobs.find((j) => j.name === name)?.lastRun
    if (last && last.status !== 'ok' && last.status !== 'skipped') reasons.push(`${name} ${last.status}`)
  }
  const wd = jobs.find((j) => j.name === 'nightwatch-watchdog')?.lastRun
  if (wd?.endedAt && nowMs - Date.parse(wd.endedAt) > WATCHDOG_STALE_MS) reasons.push('nightwatch-watchdog has not run for 15 min')
  return { status: reasons.length ? 'degraded' : 'healthy', reasons }
}

const int = (max: number) => z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().max(max))
const id = z.string().regex(ID)
const runsQuery = z.strictObject({ state: z.enum(HEALTH).optional(), role: z.enum(ROLES).optional(), ticket: id.optional(), trigger: z.enum(TRIGGERS).optional(), limit: int(500).optional() })
const eventsQuery = z.strictObject({ since: int(1e9).optional(), before: int(1e9).optional(), tail: int(1000).optional(), group: z.enum(EVENT_GROUPS).optional() })
const none = z.strictObject({})

export function createNightwatchRoutes(deps: NightwatchDeps): Hono<Env> {
  const now = deps.now ?? Date.now
  const app = new Hono<Env>()

  const fail = (c: Context<Env>, status: 400 | 404 | 405 | 503, error: string, headers: Record<string, string> = {}) => sendJson(c, status, { error }, headers)
  const serve = async <T extends z.ZodType>(c: Context<Env>, view: ViewName, args: ViewArgs, schema: T, after?: (v: z.infer<T>) => unknown) => {
    try {
      const raw = await deps.read(view, args)
      const parsed = schema.safeParse(raw)
      if (!parsed.success) return fail(c, 503, 'internal_invalid')
      return sendJson(c, 200, after ? after(parsed.data) : parsed.data)
    } catch (e) {
      if (e instanceof ReaderError && e.code === 'not_found') return fail(c, 404, 'not_found')
      return fail(c, 503, 'reader_unavailable', { 'Retry-After': '5' })
    }
  }
  const query = (c: Context<Env>) => Object.fromEntries(Object.entries(c.req.query()))

  app.all(`${NIGHTWATCH_PATH}/*`, async (c, next) => {
    if (c.req.method !== 'GET') return fail(c, 405, 'method_not_allowed', { Allow: 'GET' })
    await next()
  })

  app.get(`${NIGHTWATCH_PATH}/overview`, async (c) => {
    if (!none.safeParse(query(c)).success) return fail(c, 400, 'bad_request')
    return serve(c, 'overview', {}, overviewViewSchema, (v) => ({ ...v, nexus: nexusStatus(deps.jobs ? deps.jobs() : null, v.scan.breakerOpen, now()) }))
  })
  app.get(`${NIGHTWATCH_PATH}/attention`, async (c) => {
    if (!none.safeParse(query(c)).success) return fail(c, 400, 'bad_request')
    return serve(c, 'attention', {}, attentionSchema)
  })
  app.get(`${NIGHTWATCH_PATH}/runs`, async (c) => {
    const q = runsQuery.safeParse(query(c))
    if (!q.success) return fail(c, 400, 'bad_request')
    return serve(c, 'runs', q.data, runsSchema)
  })
  app.get(`${NIGHTWATCH_PATH}/runs/:id`, async (c) => {
    const run = id.safeParse(c.req.param('id'))
    if (!run.success || !none.safeParse(query(c)).success) return fail(c, 400, 'bad_request')
    return serve(c, 'run', { run: run.data }, runDetailSchema)
  })
  app.get(`${NIGHTWATCH_PATH}/runs/:id/events`, async (c) => {
    const run = id.safeParse(c.req.param('id'))
    const q = eventsQuery.safeParse(query(c))
    if (!run.success || !q.success) return fail(c, 400, 'bad_request')
    return serve(c, 'events', { run: run.data, ...q.data }, eventsSchema)
  })
  app.get(`${NIGHTWATCH_PATH}/plan/:ticket`, async (c) => {
    const t = id.safeParse(c.req.param('ticket'))
    if (!t.success || !none.safeParse(query(c)).success) return fail(c, 400, 'bad_request')
    return serve(c, 'plan', { ticket: t.data }, planSchema)
  })
  return app
}
