import { describe, expect, it } from 'vitest'
import { birthday, computeCalendar, readAtUtc7, todayUtc7 } from './life-calendar.ts'
import { formatDay } from '../../nexus-shared/days.ts'

const FAKE = { birthDate: '1990-01-01', lifeYears: 90 }   // fake profile: tests never use a real date

describe('computeCalendar', () => {
  it('matches the Designer mock for 2026-10-16: 1,913 lived, 2,766 left, 40.9%, this week at row 36 box 41', () => {
    const r = computeCalendar({ ...FAKE, today: '2026-10-16' })
    expect(r.totals).toEqual({ weeksTotal: 4680, weeksLived: 1913, weeksLeft: 2766, percentLived: 40.9 })
    expect(r.current).toEqual({ row: 36, box: 41 })
    expect(r.rows[36]).toEqual({ age: 36, start: '2026-01-01', end: '2026-12-31', lived: 41 })
    expect(r.rows[0]).toEqual({ age: 0, start: '1990-01-01', end: '1990-12-31', lived: 52 })
    expect(r.rows[37].lived).toBe(0)
  })
  it('the totals always add up: lived + left + (this week) = rows x 52', () => {
    for (const today of ['1990-01-01', '2000-06-15', '2026-12-31', '2027-01-01', '2079-12-31']) {
      const r = computeCalendar({ ...FAKE, today })
      expect(r.totals.weeksLived + r.totals.weeksLeft + (r.current ? 1 : 0)).toBe(4680)
    }
  })
  it('on the birthday the new row starts at box 0; the day before, the old row is at its last box', () => {
    expect(computeCalendar({ ...FAKE, today: '2027-01-01' }).current).toEqual({ row: 37, box: 0 })
    expect(computeCalendar({ ...FAKE, today: '2026-12-31' }).current).toEqual({ row: 36, box: 51 })
  })
  it('the leftover day of a 365-day year falls into box 51', () => {
    // 1990-01-01 + 364 days = 1990-12-31: day 364 => floor(364/7) = 52, clamped to box 51
    expect(computeCalendar({ ...FAKE, today: '1990-12-31' }).current).toEqual({ row: 0, box: 51 })
  })
  it('before birth: nothing lived, no current box', () => {
    const r = computeCalendar({ ...FAKE, today: '1989-12-31' })
    expect(r.current).toBeNull()
    expect(r.totals).toEqual({ weeksTotal: 4680, weeksLived: 0, weeksLeft: 4680, percentLived: 0 })
  })
  it('past the last row: all lived, no current box, 100%', () => {
    const r = computeCalendar({ ...FAKE, today: '2080-01-01' })
    expect(r.current).toBeNull()
    expect(r.totals).toEqual({ weeksTotal: 4680, weeksLived: 4680, weeksLeft: 0, percentLived: 100 })
  })
  it('a 29 February birthday counts as 1 March in a non-leap year', () => {
    expect(formatDay(birthday('1992-02-29', 1))).toBe('1993-03-01')
    expect(formatDay(birthday('1992-02-29', 4))).toBe('1996-02-29')
    const r = computeCalendar({ birthDate: '1992-02-29', lifeYears: 3, today: '1993-02-28' })
    expect(r.rows[0].end).toBe('1993-02-28')   // the day before 1993-03-01
    expect(r.rows[1].start).toBe('1993-03-01')
  })
  it('rejects a date that does not exist', () => {
    expect(() => computeCalendar({ birthDate: '1990-02-30', lifeYears: 90, today: '2026-10-16' })).toThrow('bad_date')
  })
})

describe('UTC+7 time', () => {
  it('today is the UTC+7 day: 17:30 UTC is already the next day', () => {
    expect(todayUtc7(Date.parse('2026-10-16T16:59:59Z'))).toBe('2026-10-16')
    expect(todayUtc7(Date.parse('2026-10-16T17:00:00Z'))).toBe('2026-10-17')
  })
  it('readAtUtc7 is the same moment as "YYYY-MM-DD HH:MM:SS"', () => {
    expect(readAtUtc7(Date.parse('2026-10-16T14:00:00Z'))).toBe('2026-10-16 21:00:00')
  })
})
