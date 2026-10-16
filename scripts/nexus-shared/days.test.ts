import { describe, expect, it } from 'vitest'
import { addDays, boxRange, formatDay, formatLong, formatShort, parseDay } from './days.ts'

describe('days', () => {
  it('round-trips a date', () => { expect(formatDay(parseDay('2026-10-16'))).toBe('2026-10-16') })
  it('rejects a date that does not exist or is malformed', () => {
    for (const bad of ['2026-02-30', '2026-13-01', '2026-1-1', 'x', '']) expect(() => parseDay(bad)).toThrow('bad_date')
  })
  it('adds days across a month and a leap day', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
    expect(addDays('2024-02-28', 2)).toBe('2024-03-01')
  })
  it('formats short and long, fixed English', () => {
    expect(formatShort('2026-10-12')).toBe('12 Oct 2026')
    expect(formatLong('2026-10-12')).toBe('12 October 2026')
  })
  it('box ranges: seven days, and the last box takes the row end', () => {
    const row = { start: '2026-01-01', end: '2026-12-31' }
    expect(boxRange(row, 0)).toEqual({ from: '2026-01-01', to: '2026-01-07' })
    expect(boxRange(row, 41)).toEqual({ from: '2026-10-15', to: '2026-10-21' })
    expect(boxRange(row, 51)).toEqual({ from: '2026-12-24', to: '2026-12-31' })
  })
})
