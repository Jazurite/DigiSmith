// scripts/nexus-web/app/utils/nw-format.ts
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
