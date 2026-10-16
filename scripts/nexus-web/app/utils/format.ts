const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const UTC7_MS = 7 * 3_600_000
const DAY_MS = 86_400_000

// "Friday 16 October 2026": the UTC+7 calendar day, fixed English, no locale.
export function formatHeaderDate(nowMs: number): string {
  const d = new Date(nowMs + UTC7_MS)
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export function msUntilNextMidnightUtc7(nowMs: number): number {
  const local = nowMs + UTC7_MS
  return DAY_MS - (((local % DAY_MS) + DAY_MS) % DAY_MS)
}
