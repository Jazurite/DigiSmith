import { hc } from 'hono/client'
import { apiErrorSchema, lifeCalendarSchema } from '#life-schema'
import type { AppType } from '#api-type'
import type { LifeState } from '../types'

// Calls GET /api/v1/life-calendar through Hono's typed client, then runs the shared schema on the answer (the client gives types only).
// The 503 body carries a code only, so the page can map it to a panel without learning anything private.
export async function loadLifeCalendar(opts: { base?: string; fetch?: typeof fetch } = {}): Promise<LifeState> {
  try {
    const client = hc<AppType>(opts.base ?? location.origin, opts.fetch ? { fetch: opts.fetch } : {})
    const res = await client.api.v1['life-calendar'].$get({ query: {} })
    const body: unknown = await res.json().catch(() => null)
    if (res.ok) {
      const parsed = lifeCalendarSchema.safeParse(body)
      return parsed.success ? { kind: 'loaded', data: parsed.data } : { kind: 'error' }
    }
    const err = apiErrorSchema.safeParse(body)
    if (err.success && err.data.error === 'key_unavailable') return { kind: 'locked' }
    if (err.success && err.data.error === 'profile_missing') return { kind: 'empty' }
    return { kind: 'error' }
  } catch {
    return { kind: 'error' }
  }
}
