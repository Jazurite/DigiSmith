// Date-only helpers shared by the API and the page. A "day" is a whole number of days since 1970-01-01 (UTC calendar).
const DAY_MS = 86_400_000
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function parseDay(text: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!m) throw new Error('bad_date')
  const day = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS
  if (formatDay(day) !== text) throw new Error('bad_date')   // rejects 2026-02-30 and the like
  return day
}
export function formatDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}
export function addDays(text: string, n: number): string {
  return formatDay(parseDay(text) + n)
}
// "12 Oct 2026" (tooltip) and "12 October 2026" (accessible name). Fixed English, no locale.
export function formatShort(text: string): string {
  const [y, m, d] = text.split('-').map(Number)
  return `${d} ${SHORT[m - 1]} ${y}`
}
export function formatLong(text: string): string {
  const [y, m, d] = text.split('-').map(Number)
  return `${d} ${LONG[m - 1]} ${y}`
}
// The date range of box j in a row: 7 days from start+7j; the last box (51) ends on the row's end day.
export function boxRange(row: { start: string; end: string }, box: number): { from: string; to: string } {
  const from = addDays(row.start, box * 7)
  const to = box >= 51 ? row.end : addDays(from, 6)
  return { from, to }
}
