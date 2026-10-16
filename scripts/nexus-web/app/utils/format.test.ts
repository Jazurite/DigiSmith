import { describe, expect, it } from 'vitest'
import { formatHeaderDate, msUntilNextMidnightUtc7 } from './format'

describe('format', () => {
  it('header date is the UTC+7 day in fixed English', () => {
    expect(formatHeaderDate(Date.parse('2026-10-16T14:00:00Z'))).toBe('Friday 16 October 2026')
    expect(formatHeaderDate(Date.parse('2026-10-16T17:00:00Z'))).toBe('Saturday 17 October 2026')   // 00:00 on 17 October in UTC+7
  })
  it('ms until the next UTC+7 midnight', () => {
    expect(msUntilNextMidnightUtc7(Date.parse('2026-10-16T16:59:00Z'))).toBe(60_000)
    expect(msUntilNextMidnightUtc7(Date.parse('2026-10-16T17:00:00Z'))).toBe(86_400_000)
  })
})
