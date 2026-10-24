// scripts/nexus-api/src/oculus-route.ts
import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { attentionSchema, eventsSchema, liveSchema, liveViewSchema, overviewViewSchema, planSchema, runDetailSchema, runsSchema, EVENT_GROUPS, HEALTH, ROLES, TRIGGERS } from '../../nexus-shared/oculus.ts'
import { sendJson, type Env } from './app.ts'
import { ReaderError, type Reader, type ViewArgs, type ViewName } from './oculus-reader.ts'
import type { SnapshotStore } from './oculus-snapshot.ts'
import type { JobInfo } from './scheduler/types.ts'
import { API_VERSION } from './version.ts'

export const OCULUS_PATH = `/api/${API_VERSION}/oculus` as const

export interface OculusDeps { read: Reader; jobs?: () => JobInfo[]; now?: () => number; snapshot?: SnapshotStore }

const WATCHDOG_STALE_MS = 15 * 60_000
const KNOWN_PATH = new RegExp(`^${OCULUS_PATH}/(overview|attention|live|runs|runs/[^/]+|runs/[^/]+/events|plan/[^/]+)$`)
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export type NexusState = 'healthy' | 'degraded' | 'unknown' | 'breaker-open'

export function nexusStatus(jobs: JobInfo[] | null, breakerOpen: boolean, nowMs: number): { status: NexusState; reasons: string[] } {
  if (breakerOpen) return { status: 'breaker-open', reasons: ['circuit breaker open'] }
  if (jobs === null) return { status: 'degraded', reasons: ['scheduler off'] }
  const reasons: string[] = []
  const unknown: string[] = []
  for (const name of ['autonomous-scan', 'nightwatch-watchdog']) {
    const job = jobs.find((j) => j.name === name)
    if (!job) { reasons.push(`${name} not registered`); continue }
    const last = job.lastRun
    if (!last) { unknown.push(`${name} never ran`); continue }
    if (last.status !== 'ok' && last.status !== 'skipped') reasons.push(`${name} ${last.status}`)
  }
  const wd = jobs.find((j) => j.name === 'nightwatch-watchdog')?.lastRun
  if (wd?.endedAt && nowMs - Date.parse(wd.endedAt) > WATCHDOG_STALE_MS) reasons.push('nightwatch-watchdog has not run for 15 min')
  if (reasons.length) return { status: 'degraded', reasons: [...reasons, ...unknown] }
  return unknown.length ? { status: 'unknown', reasons: unknown } : { status: 'healthy', reasons: [] }
}

const int = (max: number) => z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().max(max))
const id = z.string().regex(ID)
const runsQuery = z.strictObject({ state: z.enum(HEALTH).optional(), role: z.enum(ROLES).optional(), ticket: id.optional(), project: id.optional(), trigger: z.enum(TRIGGERS).optional(), limit: int(500).optional() })
const eventsQuery = z.strictObject({ since: int(1e9).optional(), before: int(1e9).optional(), tail: int(1000).optional(), group: z.enum(EVENT_GROUPS).optional() })
const none = z.strictObject({})

export function createOculusRoutes(deps: OculusDeps): Hono<Env> {
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

  // 405 only for a known path; any other path under the prefix is 404 whatever the method.
  app.all(`${OCULUS_PATH}/*`, async (c, next) => {
    if (!KNOWN_PATH.test(c.req.path)) return fail(c, 404, 'not_found')
    if (c.req.method !== 'GET') return fail(c, 405, 'method_not_allowed', { Allow: 'GET' })
    await next()
  })

  app.get(`${OCULUS_PATH}/overview`, async (c) => {
    if (!none.safeParse(query(c)).success) return fail(c, 400, 'bad_request')
    return serve(c, 'overview', {}, overviewViewSchema, (v) => ({ ...v, nexus: nexusStatus(deps.jobs ? deps.jobs() : null, v.scan.breakerOpen, now()) }))
  })
  app.get(`${OCULUS_PATH}/attention`, async (c) => {
    if (!none.safeParse(query(c)).success) return fail(c, 400, 'bad_request')
    return serve(c, 'attention', {}, attentionSchema)
  })
  app.get(`${OCULUS_PATH}/runs`, async (c) => {
    const q = runsQuery.safeParse(query(c))
    if (!q.success) return fail(c, 400, 'bad_request')
    return serve(c, 'runs', q.data, runsSchema)
  })
  app.get(`${OCULUS_PATH}/runs/:id`, async (c) => {
    const run = id.safeParse(c.req.param('id'))
    if (!run.success || !none.safeParse(query(c)).success) return fail(c, 400, 'bad_request')
    return serve(c, 'run', { run: run.data }, runDetailSchema)
  })
  app.get(`${OCULUS_PATH}/runs/:id/events`, async (c) => {
    const run = id.safeParse(c.req.param('id'))
    const q = eventsQuery.safeParse(query(c))
    if (!run.success || !q.success) return fail(c, 400, 'bad_request')
    return serve(c, 'events', { run: run.data, ...q.data }, eventsSchema)
  })
  app.get(`${OCULUS_PATH}/plan/:ticket`, async (c) => {
    const t = id.safeParse(c.req.param('ticket'))
    if (!t.success || !none.safeParse(query(c)).success) return fail(c, 400, 'bad_request')
    return serve(c, 'plan', { ticket: t.data }, planSchema)
  })
  let lastSaved: string | null = null
  app.get(`${OCULUS_PATH}/live`, async (c) => {
    if (!none.safeParse(query(c)).success) return fail(c, 400, 'bad_request')
    let view: unknown = null
    try { view = await deps.read('live', {}) } catch { view = null }
    const v = liveViewSchema.safeParse(view)
    if (v.success && v.data.herdr === 'ok') {
      if (deps.snapshot && lastSaved !== v.data.readAt) {
        if (deps.snapshot.save({ asOf: v.data.readAt, agents: v.data.agents })) lastSaved = v.data.readAt
        else c.set('errorCode', 'snapshot_write_failed')   // logged as a code; the answer still goes out
      }
      return sendJson(c, 200, liveSchema.parse({ readAt: v.data.readAt, herdr: { state: 'connected', asOf: v.data.readAt }, agents: v.data.agents }))
    }
    const snap = deps.snapshot?.load() ?? null
    const readAt = v.success ? v.data.readAt : new Date(now()).toISOString()
    return sendJson(c, 200, liveSchema.parse({ readAt, herdr: { state: 'disconnected', asOf: snap?.asOf ?? null }, agents: snap?.agents ?? [] }))
  })
  return app
}
