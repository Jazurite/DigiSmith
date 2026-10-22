// scripts/nexus-web/app/utils/nw-format.test.ts
import { describe, expect, it } from 'vitest'
import { ageOf, fmtDay, fmtDuration, fmtUtc7 } from './nw-format'

describe('nw-format', () => {
  it('shows UTC+7 times', () => {
    expect(fmtUtc7('2026-10-22T01:05:00.000Z')).toBe('08:05')
    expect(fmtDay('2026-10-22T20:30:00.000Z')).toBe('2026-10-23 03:30')
    expect(fmtUtc7(null)).toBe('-')
  })
  it('formats durations and ages', () => {
    expect(fmtDuration(2467)).toBe('0:41:07')
    expect(fmtDuration(null)).toBe('-')
    expect(fmtDuration(5.5)).toBe('0:00:05')
    expect(fmtDuration(-3)).toBe('0:00:00')
    expect(fmtDuration(Number.NaN)).toBe('0:00:00')
    expect(fmtDuration(Number.POSITIVE_INFINITY)).toBe('0:00:00')
    const now = Date.parse('2026-10-22T03:00:00.000Z')
    expect(ageOf('2026-10-22T00:50:00.000Z', now)).toBe('2h10m')
    expect(ageOf('2026-10-22T02:28:00.000Z', now)).toBe('32m')
    expect(ageOf(null, now)).toBe('-')
  })
})
