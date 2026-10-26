// scripts/nexus-web/app/utils/oc-format.test.ts
import { describe, expect, it } from 'vitest'
import { ageOf, fmtDay, fmtDuration, fmtMinutes, fmtTokens, fmtUsd, fmtUtc7, isRunning, isSafeId, phaseTime, spokenMinutes, spokenSeconds, stepTime } from './oc-format'

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
  it('rounds before it picks the unit at a boundary', () => {
    expect([99_960, 999_950, 999_999_999].map(fmtTokens)).toEqual(['100k', '1.0M', '1.00B'])
  })
  it('formats dollars, null as -', () => {
    expect([null, 0.004, 3.411, 1204.5].map(fmtUsd)).toEqual(['-', '<$0.01', '$3.41', '$1,204.50'])
  })
})

describe('phase and step times', () => {
  const now = Date.parse('2026-10-22T03:00:00.000Z')
  const row = { state: 'healthy' as const, phase: 'building' as const, phaseSince: '2026-10-22T02:46:00.000Z' }
  it('isRunning is true for healthy, blocked and stalled only', () => {
    for (const state of ['healthy', 'blocked', 'stalled'] as const) expect(isRunning({ state })).toBe(true)
    for (const state of ['lost', 'ended'] as const) expect(isRunning({ state })).toBe(false)
  })
  it('phaseTime: a running run with a phase', () => {
    expect(phaseTime(row, now)).toEqual({ phase: 'building', min: 14 })
    expect(phaseTime({ ...row, state: 'blocked' }, now)).toEqual({ phase: 'building', min: 14 })
    expect(phaseTime({ ...row, state: 'stalled', phase: 'review' }, now)).toEqual({ phase: 'review', min: 14 })
  })
  it('phaseTime: none for ended, lost, no phase, no start, a bad time', () => {
    expect(phaseTime({ ...row, state: 'ended' }, now)).toBeNull()
    expect(phaseTime({ ...row, state: 'lost' }, now)).toBeNull()
    expect(phaseTime({ ...row, phase: null }, now)).toBeNull()
    expect(phaseTime({ ...row, phaseSince: null }, now)).toBeNull()
    expect(phaseTime({ ...row, phaseSince: 'nope' }, now)).toBeNull()
  })
  it('phaseTime: a start after the page clock is 0, never below', () => {
    expect(phaseTime({ ...row, phaseSince: '2026-10-22T03:05:00.000Z' }, now)).toEqual({ phase: 'building', min: 0 })
  })
  it('stepTime: done from durationSec, current from at, the rest none', () => {
    const s = { step: 'building' as const, at: '2026-10-22T02:10:00.000Z', state: 'current' as const, durationSec: null }
    expect(stepTime(s, now)).toEqual({ min: 50, live: true })
    expect(stepTime({ ...s, state: 'done', durationSec: 67 * 60 + 59 }, now)).toEqual({ min: 67, live: false })
    expect(stepTime({ ...s, state: 'done', durationSec: null }, now)).toBeNull()
    expect(stepTime({ ...s, state: 'lost' }, now)).toBeNull()
    expect(stepTime({ ...s, state: 'waiting', at: null }, now)).toBeNull()
    expect(stepTime({ ...s, at: '2026-10-22T03:05:00.000Z' }, now)).toEqual({ min: 0, live: true })
    expect(stepTime({ ...s, step: 'pushed', state: 'done', durationSec: null }, now)).toBeNull()
  })
  it('says durations in words', () => {
    expect(spokenSeconds(31 * 60 + 7)).toBe('31 min 7 s')
    expect(spokenSeconds(3723)).toBe('1 h 2 min 3 s')
    expect(spokenSeconds(3600)).toBe('1 h')
    expect(spokenSeconds(0)).toBe('0 s')
    expect(spokenMinutes(14)).toBe('14 min')
    expect(spokenMinutes(67)).toBe('1 h 7 min')
    expect(spokenMinutes(60)).toBe('1 h')
    expect(spokenMinutes(0)).toBe('0 min')
  })
})
