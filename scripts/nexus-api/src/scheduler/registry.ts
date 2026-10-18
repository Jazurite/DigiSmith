import { isAbsolute } from 'node:path'
import type { JobDef } from './types.ts'

export const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000
export const MAX_TIMEOUT_MS = 2 * 60 * 60 * 1000

export type JobInput = Pick<JobDef, 'name' | 'description' | 'command'> & Partial<Omit<JobDef, 'name' | 'description' | 'command'>>

export function defineJob(input: JobInput): JobDef {
  return {
    name: input.name,
    description: input.description,
    command: input.command,
    ...(input.schedule === undefined ? {} : { schedule: input.schedule }),
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
    const s = job.schedule
    if (!s) continue
    if (!HHMM.test(s.atUtc7)) throw new Error(`job ${job.name}: atUtc7 "${s.atUtc7}" is not HH:MM`)
    if (!HHMM.test(s.windowEndUtc7)) throw new Error(`job ${job.name}: windowEndUtc7 "${s.windowEndUtc7}" is not HH:MM`)
    if (s.atUtc7 === s.windowEndUtc7) throw new Error(`job ${job.name}: window end equal to start is refused`)
    if (s.everyMinutes !== undefined && !(Number.isInteger(s.everyMinutes) && s.everyMinutes >= 5 && s.everyMinutes <= 720))
      throw new Error(`job ${job.name}: everyMinutes must be a whole number from 5 to 720`)
  }
}

export const JOBS: readonly JobDef[] = [
  defineJob({
    name: 'selftest',
    description: 'Prints one line; proves the scheduler end to end. Run now only.',
    command: { file: process.execPath, args: ['-e', "process.stdout.write('selftest ok\\n')"] },
  }),
]

validateJobs(JOBS)
