// scripts/nexus-web/app/utils/oc-format.ts
const OFFSET = 7 * 3600_000
const pad = (n: number): string => String(n).padStart(2, '0')
const local = (iso: string): Date => new Date(Date.parse(iso) + OFFSET)

export function fmtUtc7(iso: string | null): string {
  if (!iso) return '-'
  const d = local(iso)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}
export function fmtDay(iso: string | null): string {
  if (!iso) return '-'
  const d = local(iso)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}
export function fmtDuration(sec: number | null): string {
  if (sec === null) return '-'
  const s = Number.isFinite(sec) ? Math.max(0, Math.floor(sec)) : 0
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}
export function ageOf(iso: string | null, nowMs: number): string {
  if (!iso) return '-'
  const min = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 60_000))
  return min >= 60 ? `${Math.floor(min / 60)}h${pad(min % 60)}m` : `${min}m`
}
export function fmtClock(ms: number): string {
  const d = new Date(ms + OFFSET)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}
// The same rule the API applies to a run id and a ticket key; check it before an id goes into a path or a URL.
export const isSafeId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(v)
// h:mm from minutes, as the budget shows it ("0:41")
export function fmtMinutes(min: number): string {
  const m = Number.isFinite(min) ? Math.max(0, Math.floor(min)) : 0
  return `${Math.floor(m / 60)}:${pad(m % 60)}`
}
