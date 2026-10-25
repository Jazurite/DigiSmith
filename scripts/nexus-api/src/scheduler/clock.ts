import type { JobSchedule } from './types.ts'

export const UTC7_OFFSET_MS = 7 * 3600_000
const DAY_MS = 24 * 3600_000
const MINUTE_MS = 60_000

export type Slot = { key: string; atMs: number; night: string; windowStartMs: number; windowEndMs: number }

const pad = (n: number): string => String(n).padStart(2, '0')

const minutesOf = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

const midnightMs = (night: string): number => {
  const [y, m, d] = night.split('-').map(Number)
  return Date.UTC(y, m - 1, d) - UTC7_OFFSET_MS
}

const nightOf = (ms: number): string => formatUtc7(ms).slice(0, 10)

export function formatUtc7(ms: number): string {
  const d = new Date(ms + UTC7_OFFSET_MS)
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  return `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

/** The instant a slot key names, on any grid: the key is `night@HH:MM`, and a time before the window start belongs to the next day. */
export function slotKeyMs(key: string, schedule: JobSchedule): number {
  const night = key.slice(0, 10)
  const mins = minutesOf(key.slice(11, 16))
  const start = minutesOf(schedule.atUtc7)
  return midnightMs(night) + (mins < start ? mins + 1440 : mins) * MINUTE_MS
}

export function slotsOfNight(night: string, schedule: JobSchedule): Slot[] {
  const start = minutesOf(schedule.atUtc7)
  const end = minutesOf(schedule.windowEndUtc7)
  const base = midnightMs(night)
  const windowStartMs = base + start * MINUTE_MS
  const windowEndMs = base + (end < start ? end + 1440 : end) * MINUTE_MS
  const step = schedule.everyMinutes ? schedule.everyMinutes * MINUTE_MS : Infinity
  const slots: Slot[] = []
  for (let atMs = windowStartMs; atMs < windowEndMs; atMs += step) {
    slots.push({ key: `${night}@${formatUtc7(atMs).slice(11, 16)}`, atMs, night, windowStartMs, windowEndMs })
  }
  return slots
}

const nightsAround = (nowMs: number, schedule: JobSchedule, offsets: number[]): Slot[][] =>
  offsets.map((o) => slotsOfNight(nightOf(nowMs + o * DAY_MS), schedule))

export function inWindow(nowMs: number, schedule: JobSchedule): boolean {
  return nightsAround(nowMs, schedule, [-1, 0]).some((s) => s[0] && nowMs >= s[0].windowStartMs && nowMs < s[0].windowEndMs)
}

export function currentSlot(nowMs: number, schedule: JobSchedule): Slot | null {
  for (const slots of nightsAround(nowMs, schedule, [0, -1])) {
    if (!slots[0] || nowMs < slots[0].windowStartMs || nowMs >= slots[0].windowEndMs) continue
    const passed = slots.filter((s) => s.atMs <= nowMs)
    if (passed.length) return passed[passed.length - 1]
  }
  return null
}

export function nextRunAt(nowMs: number, schedule: JobSchedule): number | null {
  const times = nightsAround(nowMs, schedule, [-1, 0, 1]).flat().map((s) => s.atMs).filter((t) => t > nowMs)
  return times.length ? Math.min(...times) : null
}
