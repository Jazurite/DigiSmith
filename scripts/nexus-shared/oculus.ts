import { z } from 'zod'

const iso = z.iso.datetime()
const count = z.number().int().min(0)

export const RUN_PHASES = ['building', 'review', 'merge'] as const

export const HEALTH = ['healthy', 'blocked', 'stalled', 'lost', 'ended'] as const
export const ROLES = ['builder', 'reviewer', 'scout', 'maestro', 'conductor', 'other'] as const
export const RUN_SOURCES = ['auto', 'start'] as const
export const TRIGGERS = ['manual', 'night-scan', 'away', 'auto'] as const
export const TICKET_PHASES = ['claimed', 'building', 'review', 'merge-ready', 'merged', 'released', 'lost'] as const
export const EVENT_GROUPS = ['all', 'agent', 'system', 'errors'] as const
export const OCULUS_ERROR_CODES = ['bad_request', 'not_found', 'method_not_allowed', 'reader_unavailable', 'internal_invalid'] as const

const usd = z.number().min(0)
export const rowTokensSchema = z.strictObject({ total: count, costUsd: usd.nullable(), unpriced: z.array(z.string()) })
export const runTokensSchema = z.strictObject({
  generatedAt: iso, final: z.boolean(), priceVersion: z.string(),
  models: z.array(z.strictObject({ model: z.string(), input: count, output: count, cacheRead: count, cacheWrite5m: count, cacheWrite1h: count, responses: count, tokens: count, costUsd: usd.nullable() })),
  total: z.strictObject({ tokens: count, responses: count, costUsd: usd.nullable() }), unpriced: z.array(z.string()),
})
const seatWindow = z.strictObject({ usedPct: z.number().min(0).max(100), resetsAt: iso }).nullable()
export const burnSchema = z.strictObject({ tokensPerH: count, usdPerH: usd.nullable(), asOf: iso })
export const seatsSchema = z.strictObject({ asOf: iso, seats: z.array(z.strictObject({ seat: z.string(), readAt: iso, stale: z.boolean(), fiveHour: seatWindow, weekly: seatWindow })) })

export const runRowSchema = z.strictObject({
  run: z.string(), ticket: z.string().nullable(), role: z.enum(ROLES),
  project: z.string().nullable(), source: z.enum(RUN_SOURCES),
  seat: z.string().nullable(), model: z.string().nullable(),
  trigger: z.enum(TRIGGERS), state: z.enum(HEALTH),
  phase: z.enum(RUN_PHASES).nullable(), phaseSince: iso.nullable(),
  startedAt: iso, endedAt: iso.nullable(), elapsedSec: count, events: count,
  merged: z.boolean(), pushed: z.boolean(),
  tokens: rowTokensSchema.nullable(), tokensAsOf: iso.nullable(),
})
export type RunRow = z.infer<typeof runRowSchema>

const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()])
export const eventRowSchema = z.strictObject({
  n: count, seq: count, ts: iso, type: z.string(),
  groups: z.array(z.enum(['agent', 'system', 'errors'])),
  data: z.record(z.string(), scalar),
})
export type EventRow = z.infer<typeof eventRowSchema>

export const overviewViewSchema = z.strictObject({
  readAt: iso,
  workers: z.array(runRowSchema),
  attentionCount: count,
  tickets: z.strictObject({
    windowDays: z.number().int(),
    lockTicket: z.string().nullable(),
    rows: z.array(z.strictObject({ phase: z.enum(TICKET_PHASES), count, oldestSince: iso.nullable() })),
  }),
  lastEvents: z.array(z.strictObject({ ts: iso, source: z.string(), kind: z.string(), text: z.string() })),
  burn: burnSchema.nullable(),
  seats: seatsSchema.nullable(),
  scan: z.strictObject({
    lastScanAt: iso.nullable(), candidates: count.nullable(), away: z.boolean(),
    nightWindow: z.boolean(), breakerOpen: z.boolean(), breakerStreak: count,
  }),
})
export const overviewSchema = overviewViewSchema.extend({
  nexus: z.strictObject({ status: z.enum(['healthy', 'degraded', 'unknown', 'breaker-open']), reasons: z.array(z.string()) }),
})
export type Overview = z.infer<typeof overviewSchema>

export const attentionItemSchema = z.strictObject({
  id: z.string(), ticket: z.string().nullable(), run: z.string(), kind: z.string(), cause: z.string(),
  since: iso, causeClass: z.enum(['transient', 'durable', 'unknown']).nullable(), retryEligible: z.boolean().nullable(),
})
export const attentionSchema = z.strictObject({
  readAt: iso,
  open: z.array(attentionItemSchema),
  resolved: z.array(z.strictObject({ id: z.string(), ticket: z.string().nullable(), kind: z.string(), by: z.string(), ts: iso, note: z.string() })),
})
export type Attention = z.infer<typeof attentionSchema>

export const runsSchema = z.strictObject({ readAt: iso, total: count, runs: z.array(runRowSchema) })
export type Runs = z.infer<typeof runsSchema>

export const pipelineStepSchema = z.strictObject({
  step: z.enum(['claimed', 'worktree-ready', 'building', 'review', 'merged', 'pushed']),
  at: iso.nullable(), state: z.enum(['done', 'current', 'waiting', 'lost']), durationSec: count.nullable(),
})
export const runDetailSchema = z.strictObject({
  readAt: iso,
  row: runRowSchema,
  pipeline: z.array(pipelineStepSchema),
  budget: z.strictObject({ phase: z.enum(RUN_PHASES).nullable(), limitMin: count.nullable(), elapsedMin: count.nullable(), building: count, review: count, merge: count }),
  tokens: runTokensSchema.nullable(), tokensAsOf: iso.nullable(),
  record: z.record(z.string(), z.unknown()),
  order: z.strictObject({ available: z.boolean(), text: z.string() }),
})
export type RunDetail = z.infer<typeof runDetailSchema>

export const eventsSchema = z.strictObject({ run: z.string(), total: count, from: count, lines: z.array(eventRowSchema) })
export type Events = z.infer<typeof eventsSchema>

export const planSchema = z.strictObject({
  ticket: z.string(), found: z.boolean(), planFile: z.string().nullable(),
  tasksTotal: count, tasksDone: count,
  tasks: z.array(z.strictObject({ n: count, title: z.string(), state: z.enum(['done', 'fix-round', 'waiting']), round: count.nullable() })),
  verdicts: z.array(z.strictObject({ scope: z.string(), id: z.string(), round: count, finding: z.string(), verdict: z.enum(['fixed', 'fixing', 'parked', 'rejected']), reason: z.string() })),
  ledgerError: z.boolean(),
})
export type Plan = z.infer<typeof planSchema>

export const oculusErrorSchema = z.strictObject({ error: z.enum(OCULUS_ERROR_CODES), message: z.string().optional() })

// DGS-599: the live herdr agent list. Matches packages/cli/src/oculus/live.ts (pinned by oculus-contract.test.ts).
export const AGENT_STATUSES = ['working', 'idle', 'blocked', 'done', 'unknown'] as const
export const AGENT_ROLES = ['maestro', 'conductor', 'builder', 'reviewer', 'scout', 'other'] as const
const label = z.string().max(64)
export const liveAgentSchema = z.strictObject({
  name: label.nullable(), pane: label, tab: label.nullable(), workspace: label.nullable(),
  role: z.enum(AGENT_ROLES), project: z.string().nullable(), status: z.enum(AGENT_STATUSES), run: z.string().nullable(),
})
export type LiveAgent = z.infer<typeof liveAgentSchema>
export const liveViewSchema = z.strictObject({ readAt: iso, herdr: z.enum(['ok', 'unreachable']), agents: z.array(liveAgentSchema) })
export const liveSnapshotSchema = z.strictObject({ asOf: iso, agents: z.array(liveAgentSchema) })
export const liveSchema = z.strictObject({
  readAt: iso,
  herdr: z.strictObject({ state: z.enum(['connected', 'disconnected']), asOf: iso.nullable() }),
  agents: z.array(liveAgentSchema),
})
export type Live = z.infer<typeof liveSchema>
