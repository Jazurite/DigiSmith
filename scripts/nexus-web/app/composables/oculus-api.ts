// scripts/nexus-web/app/composables/oculus-api.ts
import type { z } from 'zod'
import { attentionSchema, eventsSchema, oculusErrorSchema, overviewSchema, planSchema, runDetailSchema, runsSchema } from '#oculus-schema'

export class OculusApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code }
}
export interface ApiOptions { base?: string; fetch?: typeof fetch }

const BASE = '/api/v1/oculus'

async function get<T extends z.ZodType>(path: string, schema: T, o: ApiOptions): Promise<z.infer<T>> {
  const f = o.fetch ?? fetch
  const origin = o.base ?? (typeof location === 'undefined' ? '' : location.origin)
  let res: Response
  try { res = await f(`${origin}${BASE}${path}`, { headers: { accept: 'application/json' } }) } catch { throw new OculusApiError(0, 'unreachable') }
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const err = oculusErrorSchema.safeParse(body)
    throw new OculusApiError(res.status, err.success ? err.data.error : 'unknown')
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new OculusApiError(res.status, 'bad_answer')
  return parsed.data
}

const qs = (q: Record<string, string | number | undefined>): string => {
  const p = Object.entries(q).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
  return p.length ? `?${p.join('&')}` : ''
}

export const loadOverview = (o: ApiOptions = {}) => get('/overview', overviewSchema, o)
export const loadAttention = (o: ApiOptions = {}) => get('/attention', attentionSchema, o)
export const loadRuns = (q: { state?: string; role?: string; ticket?: string; project?: string; trigger?: string; limit?: number } = {}, o: ApiOptions = {}) => get(`/runs${qs(q)}`, runsSchema, o)
export const loadRun = (id: string, o: ApiOptions = {}) => get(`/runs/${encodeURIComponent(id)}`, runDetailSchema, o)
export const loadEvents = (id: string, q: { since?: number; before?: number; tail?: number; group?: string } = {}, o: ApiOptions = {}) => get(`/runs/${encodeURIComponent(id)}/events${qs(q)}`, eventsSchema, o)
export const loadPlan = (ticket: string, o: ApiOptions = {}) => get(`/plan/${encodeURIComponent(ticket)}`, planSchema, o)
