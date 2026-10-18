import { spawn } from 'node:child_process'
import type { RunStatus } from './types.ts'

export interface RunCommand { file: string; args: string[] }
export interface RunOptions {
  timeoutMs: number
  killGraceMs?: number
  signal?: AbortSignal
  onStart?: (pid: number) => void
}
export interface RunResult {
  status: Extract<RunStatus, 'ok' | 'failed' | 'timeout' | 'interrupted'>
  exitCode: number | null
  detail: string
  pid?: number
}

const TAIL = 2000

export function runJob(command: RunCommand, opts: RunOptions): Promise<RunResult> {
  const killGraceMs = opts.killGraceMs ?? 10_000
  return new Promise<RunResult>((resolve) => {
    if (opts.signal?.aborted) {
      resolve({ status: 'interrupted', exitCode: null, detail: 'stopped before start' })
      return
    }
    let tail = ''
    let stopReason: 'timeout' | 'interrupted' | null = null
    let settled = false
    let timeoutTimer: NodeJS.Timeout | undefined
    let killTimer: NodeJS.Timeout | undefined

    const append = (chunk: string) => {
      tail = (tail + chunk).slice(-TAIL)
    }
    const finish = (r: RunResult) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutTimer)
      clearTimeout(killTimer)
      opts.signal?.removeEventListener('abort', onAbort)
      resolve(r)
    }

    let child: ReturnType<typeof spawn>
    try {
      child = spawn(command.file, command.args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (err) {
      finish({ status: 'failed', exitCode: null, detail: String((err as Error).message ?? err).slice(-TAIL) })
      return
    }

    const stop = (reason: 'timeout' | 'interrupted') => {
      if (stopReason || settled) return
      stopReason = reason
      child.kill('SIGTERM')
      killTimer = setTimeout(() => { child.kill('SIGKILL') }, killGraceMs)
    }
    function onAbort() { stop('interrupted') }

    child.stdout?.setEncoding('utf8').on('data', append)
    child.stderr?.setEncoding('utf8').on('data', append)
    child.on('error', (err) => {
      if (child.pid === undefined) finish({ status: 'failed', exitCode: null, detail: String(err.message).slice(-TAIL) })
    })
    child.on('close', (code) => {
      if (stopReason) finish({ status: stopReason, exitCode: code, detail: tail, pid: child.pid })
      else finish({ status: code === 0 ? 'ok' : 'failed', exitCode: code, detail: tail, pid: child.pid })
    })

    if (child.pid !== undefined) {
      try { opts.onStart?.(child.pid) } catch { /* a callback failure must not break the run */ }
      timeoutTimer = setTimeout(() => stop('timeout'), opts.timeoutMs)
      opts.signal?.addEventListener('abort', onAbort, { once: true })
      if (opts.signal?.aborted) onAbort()
    }
  })
}
