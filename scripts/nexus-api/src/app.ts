import { Hono } from 'hono'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { ApiError, PowerMetrics } from './types.ts'
import { createLogger, type Logger } from './logger.ts'
import { API_VERSION } from './version.ts'
import { zValidator } from '@hono/zod-validator'
import { lifeCalendarSchema } from '../../nexus-shared/life-calendar.ts'
import { computeCalendar, readAtUtc7, todayUtc7 } from './life-calendar.ts'
import { emptyQuery, errorCodeOf } from './life-calendar-route.ts'
import type { Profile } from './profile-crypto.ts'

export const POWER_PATH = `/api/${API_VERSION}/power-metrics` as const
export const LIFE_PATH = `/api/${API_VERSION}/life-calendar` as const

export interface AppDeps { logger?: Logger; loadProfile?: () => Promise<Profile>; now?: () => number }

// c.json() would drop the charset and re-order nothing, but c.body(JSON.stringify(...)) keeps the old bytes and headers exactly.
export type Env = { Variables: { errorCode?: string } }

export function sendJson(c: Context<any, any, any>, status: ContentfulStatusCode, body: unknown, headers: Record<string, string> = {}) {
  const code = (body as { error?: unknown } | null)?.error
  if (typeof code === 'string') c.set('errorCode', code)
  return c.body(JSON.stringify(body), status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers })
}

export function buildApp(getReading: () => Promise<PowerMetrics | null>, deps: AppDeps = {}) {
  const now = deps.now ?? Date.now
  const logger = deps.logger ?? createLogger(() => {})   // silent unless the entry point passes the real one
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    const t = performance.now()
    await next()
    logger.request({ method: c.req.method, path: c.req.path, status: c.res.status, ms: performance.now() - t, code: c.get('errorCode') })
  })
  app.all(POWER_PATH, async c => {
    // Hono runs a HEAD request through the GET route; c.req.method still says HEAD, so HEAD gets the old 405.
    if (c.req.method !== 'GET') return sendJson(c, 405, { error: 'method_not_allowed' }, { Allow: 'GET' })
    let reading: PowerMetrics | null = null
    try { reading = await getReading() } catch { reading = null }
    if (!reading) {
      const err: ApiError = { error: 'no_reading', message: 'no reading could be built' }
      return sendJson(c, 503, err, { 'Retry-After': '5' })
    }
    return sendJson(c, 200, reading)
  })
  app.notFound(c => sendJson(c, 404, { error: 'not_found' }))
  app.onError((_err, c) => sendJson(c, 503, { error: 'internal_invalid' }))   // never prints the error: its message could hold data

  app.on(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], LIFE_PATH, c => sendJson(c, 405, { error: 'method_not_allowed' }, { Allow: 'GET' }))

  return app.get(
    LIFE_PATH,
    zValidator('query', emptyQuery, (result, c) => {
      if (!result.success) return sendJson(c, 400, { error: 'bad_request' })   // never echoes the input
    }),
    async c => {
      if (c.req.method !== 'GET') return sendJson(c, 405, { error: 'method_not_allowed' }, { Allow: 'GET' })
      try {
        if (!deps.loadProfile) return sendJson(c, 503, { error: 'profile_missing' }, { 'Retry-After': '5' })
        const profile = await deps.loadProfile()
        const nowMs = now()
        const today = todayUtc7(nowMs)
        const calendar = computeCalendar({ birthDate: profile.birthDate, lifeYears: profile.lifeYears, today })
        const body = lifeCalendarSchema.parse({ readAt: new Date(nowMs).toISOString(), readAtUtc7: readAtUtc7(nowMs), today, timezone: 'UTC+7', totals: calendar.totals, current: calendar.current, rows: calendar.rows })
        c.header('Cache-Control', 'no-store')
        return c.json(body, 200, { 'Content-Type': 'application/json; charset=utf-8' })
      } catch (e) {
        return sendJson(c, 503, { error: errorCodeOf(e) }, { 'Retry-After': '5' })
      }
    },
  )
}
export type AppType = ReturnType<typeof buildApp>
