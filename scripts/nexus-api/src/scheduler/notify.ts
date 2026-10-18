import type { Logger } from '../logger.ts'
import { formatUtc7 } from './clock.ts'
import type { EngineEvent } from './engine.ts'
import { runJob } from './runner.ts'

export interface NotifierOptions {
  dg: { file: string; args: string[] }
  ticket?: string
  now?: () => number
  timeoutMs?: number
  logger?: Pick<Logger, 'error'>
}

const HOUR_MS = 3600_000
const DETAIL_MAX = 300
const UNCLEAN_KEY = '\0unclean-start'

export function createClickupNotifier(opts: NotifierOptions): (event: EngineEvent) => Promise<void> {
  const { dg, ticket = 'DGS-436', now = Date.now, timeoutMs = 30_000, logger } = opts
  const lastSent = new Map<string, number>()

  const compose = (event: EngineEvent): { key: string; text: string } | null => {
    const time = formatUtc7(now())
    if (event.type === 'unclean-start') {
      const detail = (event.run?.detail ?? '').replace(/\s+/g, ' ').trim().slice(0, DETAIL_MAX)
      return { key: UNCLEAN_KEY, text: `nexus scheduler unclean-start at ${time} (UTC+7)${detail ? `: ${detail}` : ''}` }
    }
    const { job, run } = event
    const status = run.status
    const wanted = status === 'failed' || status === 'timeout' || status === 'interrupted' || (status === 'ok' && job.notify === 'always')
    if (!wanted) return null
    const detail = run.detail.replace(/\s+/g, ' ').trim().slice(0, DETAIL_MAX)
    return { key: job.name, text: `nexus scheduler job ${job.name} ${status} at ${time} (UTC+7)${detail ? `: ${detail}` : ''}` }
  }

  return async (event) => {
    try {
      const msg = compose(event)
      if (!msg) return
      const last = lastSent.get(msg.key)
      if (last !== undefined && now() - last < HOUR_MS) return
      lastSent.set(msg.key, now())
      const r = await runJob({ file: dg.file, args: [...dg.args, 'clickup', 'add-comment', ticket, msg.text] }, { timeoutMs, killGraceMs: 1000 })
      if (r.status !== 'ok') logger?.error('scheduler_error', { where: 'notify', code: r.status })
    } catch {
      try { logger?.error('scheduler_error', { where: 'notify', code: 'internal' }) } catch { /* never rejects */ }
    }
  }
}
