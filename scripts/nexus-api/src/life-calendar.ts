// Pure life-calendar math. Date-only, UTC+7 "today". No I/O.
import { formatDay, parseDay } from '../../nexus-shared/days.ts'

export interface CalendarInput { birthDate: string; lifeYears: number; today: string }
export interface CalendarRow { age: number; start: string; end: string; lived: number }
export interface CalendarResult {
  totals: { weeksTotal: number; weeksLived: number; weeksLeft: number; percentLived: number }
  current: { row: number; box: number } | null
  rows: CalendarRow[]
}

const DAY = 86_400_000
const BOXES = 52

function isLeap(y: number): boolean { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 }

// The k-th birthday as a day number. A 29 February birthday falls on 1 March in non-leap years.
export function birthday(birthDate: string, k: number): number {
  const [y, m, d] = birthDate.split('-').map(Number)
  const year = y + k
  if (m === 2 && d === 29 && !isLeap(year)) return Date.UTC(year, 2, 1) / DAY
  return Date.UTC(year, m - 1, d) / DAY
}

export function computeCalendar({ birthDate, lifeYears, today }: CalendarInput): CalendarResult {
  const now = parseDay(today)
  parseDay(birthDate)
  const rows: CalendarRow[] = []
  let current: CalendarResult['current'] = null
  let lived = 0
  for (let k = 0; k < lifeYears; k++) {
    const start = birthday(birthDate, k)
    const end = birthday(birthDate, k + 1) - 1
    let rowLived = 0
    if (now > end) rowLived = BOXES
    else if (now >= start) {
      const box = Math.min(BOXES - 1, Math.floor((now - start) / 7))
      rowLived = box
      current = { row: k, box }
    }
    lived += rowLived
    rows.push({ age: k, start: formatDay(start), end: formatDay(end), lived: rowLived })
  }
  const weeksTotal = lifeYears * BOXES
  const weeksLeft = weeksTotal - lived - (current ? 1 : 0)
  return { totals: { weeksTotal, weeksLived: lived, weeksLeft, percentLived: Math.round((lived / weeksTotal) * 1000) / 10 }, current, rows }
}

export function todayUtc7(nowMs: number): string {
  return new Date(nowMs + 7 * 3_600_000).toISOString().slice(0, 10)
}
export function readAtUtc7(nowMs: number): string {
  return new Date(nowMs + 7 * 3_600_000).toISOString().slice(0, 19).replace('T', ' ')
}
