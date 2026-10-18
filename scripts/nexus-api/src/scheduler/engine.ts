import fs from 'node:fs/promises'
import path from 'node:path'
import { currentSlot, formatUtc7, inWindow, nextRunAt, slotsOfNight, type Slot } from './clock.ts'
import { appendRun, readRuns, readState, writeState as writeStateFile, type State } from './runlog.ts'
import { runJob, type RunResult } from './runner.ts'
import type { JobDef, JobInfo, RunRecord, RunTrigger } from './types.ts'

export type EngineEvent =
  | { type: 'run'; job: JobDef; run: RunRecord }
  | { type: 'unclean-start'; at: string; run: RunRecord | null }

export type RunNowResult =
  | { accepted: true; runId: string; startedAt: string }
  | { accepted: false; error: 'not_found' | 'already_running' | 'forbidden'; message: string }

export interface EngineOptions {
  jobs: readonly JobDef[]
  stateDir: string
  now?: () => number
  run?: typeof runJob
  notify?: (event: EngineEvent) => Promise<void>
  tickMs?: number
  killGraceMs?: number
  writeState?: (dir: string, state: State) => Promise<void>
}

export interface Engine {
  start(): Promise<void>
  stop(): Promise<void>
  tick(): Promise<void>
  whenIdle(): Promise<void>
  runNow(name: string): RunNowResult
  snapshot(): JobInfo[]
  getRuns(name: string, limit: number): Promise<RunRecord[]>
}

type InFlight = NonNullable<State['inFlight']> & { trigger?: RunTrigger }
type EngineState = Omit<State, 'inFlight'> & { inFlight: InFlight | null }
interface Item { job: JobDef; trigger: RunTrigger; slot: Slot | null; startedAt: string; id: string }

const DAY_MS = 24 * 3600_000
const LOOKBACK_LINES = 2000
const TRIGGERS: readonly RunTrigger[] = ['schedule', 'catch-up', 'manual']
const FAILURES = new Set(['failed', 'timeout', 'interrupted'])

const isoS = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
const nightOf = (ms: number): string => formatUtc7(ms).slice(0, 10)
const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err))

function validInFlight(v: unknown): InFlight | null {
  if (!v || typeof v !== 'object') return null
  const f = v as Record<string, unknown>
  if (typeof f.job !== 'string' || !f.job || typeof f.startedAt !== 'string' || Number.isNaN(Date.parse(f.startedAt))) return null
  const trigger = TRIGGERS.includes(f.trigger as RunTrigger) ? (f.trigger as RunTrigger) : undefined
  return { job: f.job, startedAt: f.startedAt, pid: typeof f.pid === 'number' ? f.pid : 0, ...(trigger ? { trigger } : {}) }
}

export function createEngine(opts: EngineOptions): Engine {
  const { jobs, stateDir: dir } = opts
  const now = opts.now ?? Date.now
  const run = opts.run ?? runJob
  const tickMs = opts.tickMs ?? 30_000
  const write = opts.writeState ?? writeStateFile

  let state: EngineState = { cleanStop: false, inFlight: null, lastSlot: {} }
  let stateExisted = false
  const handled = new Map<string, Set<string>>(jobs.map((j) => [j.name, new Set<string>()]))
  const lastRun = new Map<string, RunRecord>()
  const queue: Item[] = []
  let active: { item: Item; abort: AbortController } | null = null
  let draining: Promise<void> = Promise.resolve()
  let pumping = false
  let writes: Promise<void> = Promise.resolve()
  let ticking: Promise<void> | null = null
  let timer: NodeJS.Timeout | undefined
  let stopped = false
  let loading: Promise<void> | null = null

  const persist = (): Promise<void> => {
    const snap = JSON.parse(JSON.stringify(state)) as State
    writes = writes.then(() => write(dir, snap)).catch(() => undefined)
    return writes
  }

  const load = (): Promise<void> => (loading ??= (async () => {
    try {
      stateExisted = await fs.access(path.join(dir, 'state.json')).then(() => true, () => false)
      const s = await readState(dir)
      state = { cleanStop: s.cleanStop, inFlight: validInFlight(s.inFlight), lastSlot: { ...s.lastSlot } }
    } catch { /* defaults stay */ }
    for (const j of jobs) {
      try {
        const rs = await readRuns(dir, { job: j.name, limit: LOOKBACK_LINES })
        if (rs[0]) lastRun.set(j.name, rs[0])
        for (const r of rs) if (typeof r.slot === 'string' && r.status !== 'interrupted') handled.get(j.name)?.add(r.slot)
      } catch { /* an unreadable log only loses the look-back */ }
    }
  })())

  const notify = (event: EngineEvent): void => {
    if (!opts.notify) return
    Promise.resolve().then(() => opts.notify!(event)).catch(() => undefined)
  }

  const keyMs = (key: string, job: JobDef): number => {
    const s = job.schedule
    if (!s) return -Infinity
    const night = key.slice(0, 10)
    return slotsOfNight(night, s).find((sl) => sl.key === key)?.atMs ?? -Infinity
  }

  const log = async (job: JobDef | null, record: RunRecord, slot: Slot | null): Promise<void> => {
    try { await appendRun(dir, record) } catch { /* the run still counts as handled in memory */ }
    lastRun.set(record.job, record)
    if (job && slot && record.status !== 'interrupted') {
      handled.get(job.name)?.add(slot.key)
      const prev = state.lastSlot[job.name]
      if (!prev || keyMs(prev, job) < slot.atMs) {
        state.lastSlot[job.name] = slot.key
        await persist()
      }
    }
  }

  const skip = (job: JobDef, slot: Slot, trigger: RunTrigger, reason: string): Promise<void> => {
    const startedAt = isoS(now())
    return log(job, {
      id: `${startedAt}-${job.name}-${slot.key}`, job: job.name, trigger, slot: slot.key, status: 'skipped',
      startedAt, startedAtUtc7: formatUtc7(Date.parse(startedAt)), endedAt: null, durationMs: null, exitCode: null, detail: reason,
    }, slot)
  }

  const isBusy = (name: string): boolean => active?.item.job.name === name || queue.some((q) => q.job.name === name)

  const isHandled = (job: JobDef, key: string): boolean =>
    state.lastSlot[job.name] === key || !!handled.get(job.name)?.has(key) ||
    active?.item.job.name === job.name && active.item.slot?.key === key ||
    queue.some((q) => q.job.name === job.name && q.slot?.key === key)

  const execute = async (item: Item): Promise<void> => {
    const abort = new AbortController()
    active = { item, abort }
    let result: RunResult
    let startMs = now()
    try {
      result = await run(item.job.command, {
        timeoutMs: item.job.timeoutMs,
        ...(opts.killGraceMs === undefined ? {} : { killGraceMs: opts.killGraceMs }),
        signal: abort.signal,
        onStart: (pid) => {
          try {
            startMs = now()
            state.inFlight = { job: item.job.name, startedAt: item.startedAt, pid, trigger: item.trigger }
            void persist()
          } catch { /* the run goes on without the inFlight mark */ }
        },
      })
    } catch (err) {
      result = { status: 'failed', exitCode: null, detail: errText(err) }
    }
    const endMs = now()
    const record: RunRecord = {
      id: item.id, job: item.job.name, trigger: item.trigger, slot: item.slot?.key ?? null, status: result.status,
      startedAt: item.startedAt, startedAtUtc7: formatUtc7(Date.parse(item.startedAt)),
      endedAt: isoS(endMs), durationMs: Math.max(0, endMs - startMs), exitCode: result.exitCode, detail: result.detail ?? '',
    }
    await log(item.job, record, item.slot)
    state.inFlight = null
    active = null
    await persist()
    if (FAILURES.has(record.status) || item.job.notify === 'always') notify({ type: 'run', job: item.job, run: record })
  }

  const drain = (): void => {
    if (pumping || !queue.length || stopped) return
    pumping = true
    draining = (async () => {
      while (queue.length && !stopped) {
        const item = queue.shift()!
        try { await execute(item) } catch { active = null }
      }
      pumping = false
    })()
  }

  const enqueue = (job: JobDef, trigger: RunTrigger, slot: Slot | null): Item => {
    const startedAt = isoS(now())
    const item = { job, trigger, slot, startedAt, id: `${startedAt}-${job.name}` }
    queue.push(item)
    return item
  }

  const tickJob = async (job: JobDef, t: number, due: Item[]): Promise<void> => {
    const s = job.schedule
    if (!s) return
    const cur = currentSlot(t, s)
    const slots = [nightOf(t - DAY_MS), nightOf(t)].flatMap((n) => slotsOfNight(n, s)).filter((sl) => sl.atMs <= t)
    for (const sl of slots) {
      if (isHandled(job, sl.key) || due.some((d) => d.job === job)) continue
      if (!cur || sl.key !== cur.key) { await skip(job, sl, 'catch-up', 'missed'); continue }
      const onTime = t - sl.atMs < tickMs
      const trigger: RunTrigger = onTime ? 'schedule' : 'catch-up'
      if (isBusy(job.name)) await skip(job, sl, trigger, 'busy')
      else if (!onTime && job.catchUp === 'skip') await skip(job, sl, 'catch-up', 'missed')
      else due.push({ job, trigger, slot: sl, startedAt: '', id: '' })
    }
  }

  const tick = (): Promise<void> => {
    if (ticking) return ticking
    ticking = (async () => {
      try {
        await load()
        if (stopped) return
        const t = now()
        const due: Item[] = []
        for (const job of jobs) {
          try { await tickJob(job, t, due) } catch { /* one job's tick never blocks the others */ }
        }
        due.sort((a, b) => a.job.order - b.job.order || jobs.indexOf(a.job) - jobs.indexOf(b.job))
        for (const d of due) enqueue(d.job, d.trigger, d.slot)
        drain()
      } catch { /* the next tick tries again */ } finally {
        ticking = null
      }
    })()
    return ticking
  }

  return {
    async start() {
      await load()
      try {
        if (stateExisted && !state.cleanStop) {
          const f = state.inFlight
          let record: RunRecord | null = null
          if (f) {
            const ms = Date.parse(f.startedAt)
            record = {
              id: `${isoS(ms)}-${f.job}`, job: f.job, trigger: f.trigger ?? 'schedule', slot: null, status: 'interrupted',
              startedAt: f.startedAt, startedAtUtc7: formatUtc7(ms), endedAt: null, durationMs: null, exitCode: null,
              detail: 'the server stopped without a clean stop; slot unknown',
            }
            await log(null, record, null)
          }
          notify({ type: 'unclean-start', at: isoS(now()), run: record })
        }
        state.inFlight = null
        state.cleanStop = false
        await persist()
      } catch { /* start goes on; the tick must run */ }
      timer = setInterval(() => { void tick() }, tickMs)
      timer.unref()
      await tick()
    },

    async stop() {
      clearInterval(timer)
      await ticking
      stopped = true
      active?.abort.abort()
      await draining
      for (const item of queue.splice(0)) {
        await log(item.job, {
          id: item.id, job: item.job.name, trigger: item.trigger, slot: item.slot?.key ?? null, status: 'interrupted',
          startedAt: item.startedAt, startedAtUtc7: formatUtc7(Date.parse(item.startedAt)),
          endedAt: null, durationMs: null, exitCode: null, detail: 'stopped before start',
        }, item.slot)
      }
      state.cleanStop = true
      await persist()
    },

    tick,

    async whenIdle() {
      await ticking
      await draining
      await writes
    },

    runNow(name) {
      const job = jobs.find((j) => j.name === name)
      if (!job) return { accepted: false, error: 'not_found', message: `no job named ${name}` }
      const s = job.schedule
      if (job.manualOutsideWindow === 'refused' && (!s || !inWindow(now(), s))) {
        const win = s ? `${s.atUtc7} to ${s.windowEndUtc7} UTC+7` : 'none'
        return { accepted: false, error: 'forbidden', message: `${name} runs only inside its window ${win}` }
      }
      if (isBusy(name)) return { accepted: false, error: 'already_running', message: `${name} is already running or queued` }
      const item = enqueue(job, 'manual', null)
      drain()
      return { accepted: true, runId: item.id, startedAt: item.startedAt }
    },

    snapshot() {
      const t = now()
      return jobs.map((job): JobInfo => {
        const s = job.schedule
        const next = s ? nextRunAt(t, s) : null
        const mine = active?.item.job === job ? active.item : queue.find((q) => q.job === job)
        return {
          name: job.name, description: job.description,
          schedule: s ? { atUtc7: s.atUtc7, windowEndUtc7: s.windowEndUtc7, everyMinutes: s.everyMinutes ?? null } : null,
          nextRunAt: next === null ? null : isoS(next), nextRunAtUtc7: next === null ? null : formatUtc7(next),
          running: mine ? { startedAt: mine.startedAt, trigger: mine.trigger } : null,
          lastRun: lastRun.get(job.name) ?? null,
        }
      })
    },

    getRuns(name, limit) {
      return readRuns(dir, { job: name, limit })
    },
  }
}
