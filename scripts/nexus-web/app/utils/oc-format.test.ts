// scripts/nexus-web/app/utils/oc-format.test.ts
import { describe, expect, it } from 'vitest'
import { ageOf, fmtDay, fmtDuration, fmtMinutes, fmtTokens, fmtUsd, fmtUtc7, isSafeId } from './oc-format'

describe('oc-format', () => {
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
  it('checks ids with the API rule and formats minutes', () => {
    for (const ok of ['DGS-1', 'builder-20261022T021000-a1b2c3', 'a.b_c']) expect(isSafeId(ok), ok).toBe(true)
    for (const bad of ['', '-x', '../x', 'a/b', 'a b', 'a?b', undefined, 3]) expect(isSafeId(bad), String(bad)).toBe(false)
    expect(fmtMinutes(41)).toBe('0:41')
    expect(fmtMinutes(135)).toBe('2:15')
    expect(fmtMinutes(-1)).toBe('0:00')
  })
  it('formats tokens compactly', () => {
    expect([950, 12_300, 1_234_567, 3_400_000_000].map(fmtTokens)).toEqual(['950', '12.3k', '1.2M', '3.40B'])
  })
  it('formats dollars, null as -', () => {
    expect([null, 0.004, 3.411, 1204.5].map(fmtUsd)).toEqual(['-', '<$0.01', '$3.41', '$1,204.50'])
  })
})
