import { describe, expect, it } from 'vitest'
import { currentSlot, formatUtc7, inWindow, nextRunAt, slotKeyMs, slotsOfNight, UTC7_OFFSET_MS } from './clock.ts'
import type { JobSchedule } from './types.ts'

const utc7 = (iso: string): number => Date.parse(`${iso}+07:00`)
const early: JobSchedule = { atUtc7: '00:10', windowEndUtc7: '05:00' }
const night: JobSchedule = { atUtc7: '23:00', windowEndUtc7: '06:00' }
const hourly: JobSchedule = { ...night, everyMinutes: 60 }
const every90: JobSchedule = { ...night, everyMinutes: 90 }
const keys = (n: string, s: JobSchedule): string[] => slotsOfNight(n, s).map((x) => x.key)

describe('offset', () => {
  it('is seven hours', () => expect(UTC7_OFFSET_MS).toBe(7 * 3600_000))
  it('formats UTC+7 across a UTC day', () => {
    expect(formatUtc7(Date.parse('2026-10-18T17:10:03Z'))).toBe('2026-10-19 00:10:03')
  })
  it('formats across a UTC month change', () => {
    expect(formatUtc7(Date.parse('2026-10-31T17:00:00Z'))).toBe('2026-11-01 00:00:00')
  })
})

describe('slotsOfNight', () => {
  it('puts the 00:10 slot at 17:10Z the day before', () => {
    const [s] = slotsOfNight('2026-10-19', early)
    expect(new Date(s.atMs).toISOString()).toBe('2026-10-18T17:10:00.000Z')
    expect(s.key).toBe('2026-10-19@00:10')
    expect(s.night).toBe('2026-10-19')
    expect(new Date(s.windowEndMs).toISOString()).toBe('2026-10-18T22:00:00.000Z')
    expect(s.windowStartMs).toBe(s.atMs)
  })
  it('gives one slot without everyMinutes', () => {
    expect(keys('2026-10-18', night)).toEqual(['2026-10-18@23:00'])
  })
  it('crosses midnight for the window end', () => {
    const [s] = slotsOfNight('2026-10-18', night)
    expect(formatUtc7(s.windowEndMs)).toBe('2026-10-19 06:00:00')
  })
  it('hourly slots end with the last start before 06:00', () => {
    expect(keys('2026-10-18', hourly)).toEqual([
      '2026-10-18@23:00', '2026-10-18@00:00', '2026-10-18@01:00',
      '2026-10-18@02:00', '2026-10-18@03:00', '2026-10-18@04:00', '2026-10-18@05:00',
    ])
  })
  it('the 01:00 slot belongs to the night before', () => {
    const s = slotsOfNight('2026-10-18', hourly)[2]
    expect(s.night).toBe('2026-10-18')
    expect(formatUtc7(s.atMs)).toBe('2026-10-19 01:00:00')
  })
  it('90-minute slots', () => {
    expect(keys('2026-10-18', every90).map((k) => k.split('@')[1])).toEqual(['23:00', '00:30', '02:00', '03:30', '05:00'])
  })
  it('works across a UTC month change', () => {
    const s = slotsOfNight('2026-10-31', hourly)
    expect(formatUtc7(s[2].atMs)).toBe('2026-11-01 01:00:00')
    expect(s[2].night).toBe('2026-10-31')
    expect(new Date(s[0].atMs).toISOString()).toBe('2026-10-31T16:00:00.000Z')
  })
})

describe('inWindow', () => {
  it('includes start and excludes end', () => {
    expect(inWindow(utc7('2026-10-19T00:10:00'), early)).toBe(true)
    expect(inWindow(utc7('2026-10-19T00:09:59'), early)).toBe(false)
    expect(inWindow(utc7('2026-10-19T04:59:59'), early)).toBe(true)
    expect(inWindow(utc7('2026-10-19T05:00:00'), early)).toBe(false)
  })
  it('handles a window across midnight', () => {
    expect(inWindow(utc7('2026-10-18T23:30:00'), night)).toBe(true)
    expect(inWindow(utc7('2026-10-19T02:00:00'), night)).toBe(true)
    expect(inWindow(utc7('2026-10-19T06:00:00'), night)).toBe(false)
    expect(inWindow(utc7('2026-10-19T12:00:00'), night)).toBe(false)
  })
})

describe('currentSlot', () => {
  it('is null outside the window', () => {
    expect(currentSlot(utc7('2026-10-19T12:00:00'), night)).toBeNull()
    expect(currentSlot(utc7('2026-10-19T06:00:00'), night)).toBeNull()
  })
  it('is the night slot before midnight', () => {
    expect(currentSlot(utc7('2026-10-18T23:30:00'), hourly)?.key).toBe('2026-10-18@23:00')
  })
  it('is the latest passed slot after midnight, of the night before', () => {
    const s = currentSlot(utc7('2026-10-19T02:30:00'), hourly)
    expect(s?.key).toBe('2026-10-18@02:00')
    expect(s?.night).toBe('2026-10-18')
  })
  it('uses the slot instant itself', () => {
    expect(currentSlot(utc7('2026-10-19T00:10:00'), early)?.key).toBe('2026-10-19@00:10')
  })
  it('crosses a month change', () => {
    expect(currentSlot(utc7('2026-11-01T01:20:00'), hourly)?.key).toBe('2026-10-31@01:00')
  })
})

describe('nextRunAt', () => {
  it('is tonight before the window', () => {
    expect(nextRunAt(utc7('2026-10-18T12:00:00'), night)).toBe(utc7('2026-10-18T23:00:00'))
  })
  it('is the next slot inside the window', () => {
    expect(nextRunAt(utc7('2026-10-19T01:30:00'), hourly)).toBe(utc7('2026-10-19T02:00:00'))
  })
  it('after the window ends is the next evening', () => {
    expect(nextRunAt(utc7('2026-10-19T06:00:00'), hourly)).toBe(utc7('2026-10-19T23:00:00'))
    expect(nextRunAt(utc7('2026-10-19T05:30:00'), early)).toBe(utc7('2026-10-20T00:10:00'))
  })
  it('is strictly after now', () => {
    expect(nextRunAt(utc7('2026-10-19T00:10:00'), early)).toBe(utc7('2026-10-20T00:10:00'))
  })
  it('crosses a month change', () => {
    expect(nextRunAt(utc7('2026-10-31T23:30:00'), hourly)).toBe(utc7('2026-11-01T00:00:00'))
    expect(nextRunAt(utc7('2026-11-01T05:30:00'), hourly)).toBe(utc7('2026-11-01T23:00:00'))
  })
})

describe('slotKeyMs', () => {
  it('is the same instant on any grid', () => {
    const at = (s: string): number => Date.parse(s.replace(' ', 'T') + '+07:00')
    for (const every of [5, 15, 30, 45]) {
      expect(slotKeyMs('2026-10-19@10:20', { atUtc7: '00:00', windowEndUtc7: '23:59', everyMinutes: every })).toBe(at('2026-10-19 10:20:00'))
    }
  })
  it('a key after midnight in a window that crosses midnight belongs to the next day', () => {
    const s = { atUtc7: '23:00', windowEndUtc7: '06:00', everyMinutes: 60 }
    expect(slotKeyMs('2026-10-19@23:00', s)).toBe(Date.parse('2026-10-19T23:00:00+07:00'))
    expect(slotKeyMs('2026-10-19@02:00', s)).toBe(Date.parse('2026-10-20T02:00:00+07:00'))
  })
})
