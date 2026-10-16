import { describe, expect, it } from 'vitest'
import { apiErrorSchema, lifeCalendarSchema } from './life-calendar.ts'

const good = {
  readAt: '2026-10-16T14:00:00.000Z', readAtUtc7: '2026-10-16 21:00:00', today: '2026-10-16', timezone: 'UTC+7',
  totals: { weeksTotal: 52, weeksLived: 10, weeksLeft: 41, percentLived: 19.2 },
  current: { row: 0, box: 10 },
  rows: [{ age: 0, start: '2026-01-01', end: '2026-12-31', lived: 10 }],
}

describe('life-calendar schema', () => {
  it('accepts a good body and a null current', () => {
    expect(lifeCalendarSchema.safeParse(good).success).toBe(true)
    expect(lifeCalendarSchema.safeParse({ ...good, current: null }).success).toBe(true)
  })
  it('is strict: any extra key is rejected, including a birth-date key', () => {
    expect(lifeCalendarSchema.safeParse({ ...good, birthDate: '2000-01-01' }).success).toBe(false)
    expect(lifeCalendarSchema.safeParse({ ...good, rows: [{ ...good.rows[0], born: 'x' }] }).success).toBe(false)
  })
  it('rejects a bad lived count and a bad date', () => {
    expect(lifeCalendarSchema.safeParse({ ...good, rows: [{ ...good.rows[0], lived: 53 }] }).success).toBe(false)
    expect(lifeCalendarSchema.safeParse({ ...good, today: '16-10-2026' }).success).toBe(false)
  })
  it('has no field whose name suggests a birth date', () => {
    const names = JSON.stringify(Object.keys(lifeCalendarSchema.shape)) + JSON.stringify(Object.keys(lifeCalendarSchema.shape.rows.element.shape))
    expect(names).not.toMatch(/birth|born|dob/i)
  })
  it('the error body schema takes a known code and no extra key', () => {
    expect(apiErrorSchema.safeParse({ error: 'key_unavailable' }).success).toBe(true)
    expect(apiErrorSchema.safeParse({ error: 'no_reading', message: 'x' }).success).toBe(true)
    expect(apiErrorSchema.safeParse({ error: 'made_up' }).success).toBe(false)
    expect(apiErrorSchema.safeParse({ error: 'not_found', detail: 'x' }).success).toBe(false)
  })
})
