import { Hono } from 'hono'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { ApiError, PowerMetrics } from './types.ts'
import { API_VERSION } from './version.ts'

export const POWER_PATH = `/api/${API_VERSION}/power-metrics` as const

// c.json() would drop the charset and re-order nothing, but c.body(JSON.stringify(...)) keeps the old bytes and headers exactly.
export function sendJson(c: Context, status: ContentfulStatusCode, body: unknown, headers: Record<string, string> = {}) {
  return c.body(JSON.stringify(body), status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers })
}

export function buildApp(getReading: () => Promise<PowerMetrics | null>) {
  const app = new Hono()
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
  return app
}
export type AppType = ReturnType<typeof buildApp>
