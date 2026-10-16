import { z } from 'zod'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const count = z.number().int().min(0)

// The JSON of GET /api/v1/life-calendar. Strict: an unknown key, including any birth-date key, fails validation.
export const lifeCalendarSchema = z.strictObject({
  readAt: z.string(),
  readAtUtc7: z.string(),
  today: day,
  timezone: z.literal('UTC+7'),
  totals: z.strictObject({
    weeksTotal: count.min(1),
    weeksLived: count,
    weeksLeft: count,
    percentLived: z.number().min(0).max(100),
  }),
  current: z.strictObject({ row: count, box: count.max(51) }).nullable(),
  rows: z.array(z.strictObject({ age: count, start: day, end: day, lived: count.max(52) })).min(1),
})
export type LifeCalendar = z.infer<typeof lifeCalendarSchema>

export const API_ERROR_CODES = ['profile_missing', 'profile_invalid', 'key_unavailable', 'internal_invalid', 'bad_request', 'no_reading', 'not_found', 'method_not_allowed'] as const
export const apiErrorSchema = z.strictObject({ error: z.enum(API_ERROR_CODES), message: z.string().optional() })
export type ApiErrorBody = z.infer<typeof apiErrorSchema>
