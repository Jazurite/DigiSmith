import { computeCalendar, readAtUtc7 } from '../../nexus-api/src/life-calendar'
import type { LifeCalendar } from '../../nexus-shared/life-calendar'

export const FAKE_PROFILE = { birthDate: '1990-01-01', lifeYears: 90 }   // fake: the only profile any test or story uses

// A LifeCalendar for the fake profile on a given UTC+7 day (default: the Designer mock's day).
export function fixture(today = '2026-10-16', profile = FAKE_PROFILE): LifeCalendar {
  const c = computeCalendar({ ...profile, today })
  const nowMs = Date.parse(`${today}T14:00:00Z`)   // 21:00 in UTC+7 on that day
  return { readAt: new Date(nowMs).toISOString(), readAtUtc7: readAtUtc7(nowMs), today, timezone: 'UTC+7', totals: c.totals, current: c.current, rows: c.rows }
}
export const BEFORE_BIRTH = () => fixture('1989-12-31')
export const PAST_LAST_ROW = () => fixture('2080-01-01')
