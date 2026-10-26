import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { createLogger } from '../logger.ts'
import { readScanInterval } from './scan-interval.ts'
import type { JobDef, JobSchedule } from './types.ts'

const DRIFT_CHECK = join(homedir(), '.digismith-depot', 'bin', 'drift-check.ts')
const MAIN_CHECKOUT = join(homedir(), 'Workspace', 'Jazurite', 'DigiSmith')
// The config the scan interval is read from: the main checkout's, the same one the job's `--repo` points at.
const CONFIG_FILE = join(MAIN_CHECKOUT, '.digismith', 'config.yml')
// The built CLI of the main checkout: the same build the global `dg` runs. A missing dist fails the job with node's "Cannot find module".
const DG = [join(MAIN_CHECKOUT, 'packages', 'cli', 'dist', 'index.js')]

export const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000
export const MAX_TIMEOUT_MS = 2 * 60 * 60 * 1000

export type JobInput = Pick<JobDef, 'name' | 'description' | 'command'> & Partial<Omit<JobDef, 'name' | 'description' | 'command'>>

export function defineJob(input: JobInput): JobDef {
  return {
    name: input.name,
    description: input.description,
    command: input.command,
    ...(input.schedule === undefined ? {} : { schedule: input.schedule }),
    ...(input.scheduleOf === undefined ? {} : { scheduleOf: input.scheduleOf }),
    timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    catchUp: input.catchUp ?? 'run-once-in-window',
    order: input.order ?? 100,
    notify: input.notify ?? 'failures',
    manualOutsideWindow: input.manualOutsideWindow ?? 'allowed',
  }
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function validateJobs(jobs: readonly JobDef[]): void {
  const seen = new Set<string>()
  for (const job of jobs) {
    if (!NAME.test(job.name)) throw new Error(`job name "${job.name}" is not url-safe (lowercase letters, digits, single hyphens)`)
    if (seen.has(job.name)) throw new Error(`job name "${job.name}" is duplicate; names must be unique`)
    seen.add(job.name)
    if (typeof job.order !== 'number' || !Number.isFinite(job.order)) throw new Error(`job ${job.name}: order must be a finite number`)
    if (!isAbsolute(job.command.file)) throw new Error(`job ${job.name}: command file must be an absolute path`)
    if (!Number.isFinite(job.timeoutMs) || job.timeoutMs <= 0 || job.timeoutMs > MAX_TIMEOUT_MS)
      throw new Error(`job ${job.name}: timeoutMs must be above 0 and at most ${MAX_TIMEOUT_MS}`)
    for (const s of [job.schedule, job.scheduleOf?.()]) {
      if (!s) continue
      if (!HHMM.test(s.atUtc7)) throw new Error(`job ${job.name}: atUtc7 "${s.atUtc7}" is not HH:MM`)
      if (!HHMM.test(s.windowEndUtc7)) throw new Error(`job ${job.name}: windowEndUtc7 "${s.windowEndUtc7}" is not HH:MM`)
      if (s.atUtc7 === s.windowEndUtc7) throw new Error(`job ${job.name}: window end equal to start is refused`)
      if (s.everyMinutes !== undefined && !(Number.isInteger(s.everyMinutes) && s.everyMinutes >= 5 && s.everyMinutes <= 720))
        throw new Error(`job ${job.name}: everyMinutes must be a whole number from 5 to 720`)
    }
  }
}

/** The autonomous-scan schedule: the interval is nightwatch.scan_every_minutes in .digismith/config.yml, read at each call (default and fallback 30; see WATCHDOG.md, "The scan interval"). */
export function scanScheduleOf(configFile: string = CONFIG_FILE, onProblem: (problem: string) => void = logScanProblem): () => JobSchedule {
  let last: string | null = null
  return () => {
    const { minutes, problem } = readScanInterval(configFile)
    if (problem !== last && problem !== null) onProblem(problem)
    last = problem
    return { atUtc7: '00:00', windowEndUtc7: '23:59', everyMinutes: minutes }
  }
}

// One fixed-field line per change; the problem text itself stays in the watchdog's attention item, not in the log.
const logScanProblem = (): void => createLogger().error('scheduler_error', { where: 'scan_interval', code: 'bad_scan_interval' })

export const JOBS: readonly JobDef[] = [
  defineJob({
    name: 'selftest',
    description: 'Prints one line; proves the scheduler end to end. Run now only.',
    command: {
      file: process.execPath,
      args: ['-e', "if (process.env.SELFTEST_FAIL === '1') { process.stderr.write('selftest failed (SELFTEST_FAIL=1)\\n'); process.exit(1) } else process.stdout.write('selftest ok\\n')"],
    },
  }),
  defineJob({
    name: 'autonomous-scan',
    description: 'Autonomous Operation: at any hour, claim one to do ticket with any Mode but Manual and hand it to the conductor',
    // the literal 30 is only a placeholder (the default): scheduleOf below overrides it at every tick from nightwatch.scan_every_minutes in .digismith/config.yml
    schedule: { atUtc7: '00:00', windowEndUtc7: '23:59', everyMinutes: 30 },
    scheduleOf: scanScheduleOf(),
    command: { file: process.execPath, args: [...DG, 'autonomous', 'scan', '--repo', MAIN_CHECKOUT] },
    timeoutMs: 5 * 60 * 1000, catchUp: 'skip', order: 50, notify: 'failures', manualOutsideWindow: 'allowed',
  }),
  defineJob({
    name: 'autonomous-report',
    description: 'Autonomous Operation: write the report for the time since the previous report',
    schedule: { atUtc7: '06:00', windowEndUtc7: '07:00' },
    command: { file: process.execPath, args: [...DG, 'autonomous', 'report'] },
    timeoutMs: 5 * 60 * 1000, catchUp: 'run-once-in-window', order: 60, notify: 'failures', manualOutsideWindow: 'allowed',
  }),
  defineJob({
    name: 'nightwatch-watchdog',
    description: 'Watches every open run for blocked, stalled and lost; writes the attention list. No model tokens.',
    schedule: { atUtc7: '00:00', windowEndUtc7: '23:59', everyMinutes: 5 },
    command: { file: process.execPath, args: [...DG, 'autonomous', 'watch', '--repo', MAIN_CHECKOUT] },
    timeoutMs: 2 * 60 * 1000, catchUp: 'skip', order: 40, notify: 'failures', manualOutsideWindow: 'allowed',
  }),
  defineJob({
    name: 'schedule-release',
    description: 'Scheduling: move each scheduled ticket whose Scheduled at is past to to do (both Modes). No model tokens.',
    schedule: { atUtc7: '00:00', windowEndUtc7: '23:59', everyMinutes: 5 },
    command: { file: process.execPath, args: [...DG, 'autonomous', 'schedule-release'] },
    timeoutMs: 2 * 60 * 1000, catchUp: 'skip', order: 45, notify: 'failures', manualOutsideWindow: 'allowed',
  }),
  defineJob({
    name: 'oculus-tokens',
    description: 'Writes each run\'s tokens and cost, the burn per hour and the seat windows for Oculus (DGS-590). Reads transcripts for counts only. No model tokens.',
    schedule: { atUtc7: '00:00', windowEndUtc7: '23:59', everyMinutes: 5 },
    command: { file: process.execPath, args: [...DG, 'tokens', 'runs'] },
    timeoutMs: 4 * 60 * 1000, catchUp: 'skip', order: 70, notify: 'failures', manualOutsideWindow: 'allowed',
  }),
  defineJob({
    name: 'drift-sweep',
    description: 'Finds line-ending and mode drift in every checkout under ~/Workspace; writes drift-sweep.json for the session-start alarm (DGS-557). Read-only. No model tokens.',
    schedule: { atUtc7: '00:00', windowEndUtc7: '23:59', everyMinutes: 10 },
    command: { file: process.execPath, args: ['--experimental-strip-types', DRIFT_CHECK, '--sweep'] },
    timeoutMs: 4 * 60 * 1000, catchUp: 'skip', order: 80, notify: 'failures', manualOutsideWindow: 'allowed',
  }),
]

validateJobs(JOBS)
