// scripts/nexus-web/app/utils/oc-format.ts
import type { RunDetail, RunRow } from '#oculus-schema'
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
// 950, 12.3k, 1.2M, 3.40B: one decimal under 100 of a unit, none above; B keeps two decimals.
// The value is rounded first and the unit chosen after, so 999_950 is 1.0M and never 1000k.
export function fmtTokens(n: number): string {
  if (n < 1000) return String(n)
  const units: [number, string][] = [[1e3, 'k'], [1e6, 'M'], [1e9, 'B']]
  let i = 0
  while (i < units.length - 1 && n >= units[i + 1]![0]) i++
  for (;;) {
    const [size, unit] = units[i]!
    const v = n / size
    if (unit === 'B') return `${v.toFixed(2)}B`
    const r = v < 100 ? Math.round(v * 10) / 10 : Math.round(v)
    if (r >= 1000) { i++; continue }   // rounds up to the next unit
    return `${r < 100 && v < 100 ? v.toFixed(1) : Math.round(v)}${unit}`
  }
}
const usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
export function fmtUsd(n: number | null): string {
  if (n === null) return '-'
  if (n > 0 && n < 0.01) return '<$0.01'
  return usdFmt.format(n)
}
const RUNNING = new Set(['healthy', 'blocked', 'stalled'])
const minutesSince = (iso: string, nowMs: number): number | null => {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? Math.max(0, Math.floor((nowMs - t) / 60_000)) : null
}
// The current phase and its whole minutes, for a running run only: an ended or lost run, or one with no phase, gets none (never a false number).
export function phaseTime(r: Pick<RunRow, 'state' | 'phase' | 'phaseSince'>, nowMs: number): { phase: string; min: number } | null {
  if (!RUNNING.has(r.state) || r.phase === null || r.phaseSince === null) return null
  const min = minutesSince(r.phaseSince, nowMs)
  return min === null ? null : { phase: r.phase, min }
}
// A done step's minutes come from the CLI; the current step counts on the page clock. Lost, waiting and Pushed get none.
export function stepTime(s: RunDetail['pipeline'][number], nowMs: number): { min: number; live: boolean } | null {
  if (s.state === 'current' && s.at !== null) {
    const min = minutesSince(s.at, nowMs)
    return min === null ? null : { min, live: true }
  }
  if (s.state === 'done' && s.durationSec !== null) return { min: Math.floor(s.durationSec / 60), live: false }
  return null
}
const words = (parts: [number, string][], zero: string): string => parts.filter(([n]) => n > 0).map(([n, u]) => `${n} ${u}`).join(' ') || zero
// Durations for screen readers: "31 min 7 s", "1 h 7 min"; the "·" and h:mm are not read out.
export function spokenSeconds(sec: number): string {
  const s = Number.isFinite(sec) ? Math.max(0, Math.floor(sec)) : 0
  return words([[Math.floor(s / 3600), 'h'], [Math.floor((s % 3600) / 60), 'min'], [s % 60, 's']], '0 s')
}
export function spokenMinutes(min: number): string {
  const m = Number.isFinite(min) ? Math.max(0, Math.floor(min)) : 0
  return words([[Math.floor(m / 60), 'h'], [m % 60, 'min']], '0 min')
}
