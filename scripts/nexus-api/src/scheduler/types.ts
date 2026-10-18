export type RunStatus = 'ok' | 'failed' | 'timeout' | 'interrupted' | 'skipped'
export type RunTrigger = 'schedule' | 'catch-up' | 'manual'

export interface JobSchedule { atUtc7: string; windowEndUtc7: string; everyMinutes?: number }

export interface JobDef {
  name: string
  description: string
  schedule?: JobSchedule
  command: { file: string; args: string[] }
  timeoutMs: number
  catchUp: 'run-once-in-window' | 'skip'
  order: number
  notify: 'failures' | 'always'
  manualOutsideWindow: 'allowed' | 'refused'
}

export interface RunRecord {
  id: string
  job: string
  trigger: RunTrigger
  slot: string | null
  status: RunStatus
  startedAt: string; startedAtUtc7: string
  endedAt: string | null; durationMs: number | null
  exitCode: number | null
  detail: string
}
export interface JobInfo {
  name: string; description: string
  schedule: { atUtc7: string; windowEndUtc7: string; everyMinutes: number | null } | null
  nextRunAt: string | null; nextRunAtUtc7: string | null
  running: { startedAt: string; trigger: RunTrigger } | null
  queued: { since: string; trigger: RunTrigger } | null
  lastRun: RunRecord | null
}
export interface JobsResponse { generatedAt: string; jobs: JobInfo[] }
export interface RunsResponse { job: string; runs: RunRecord[] }
export interface RunNowRequest { confirm: string }
export interface RunNowResponse { accepted: true; run: { id: string; startedAt: string } }
export interface JobsError { error: 'not_found' | 'already_running' | 'bad_request' | 'forbidden' | 'method_not_allowed' | 'stopped'; message: string }
