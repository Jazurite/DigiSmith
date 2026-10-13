// Runs one expensive read at a time and shares it: concurrent callers get the run in flight, a result (ok or not) is reused for ttlMs,
// and a run that takes longer than timeoutMs is aborted and reported as `timeout`.
export type Outcome<T> =
  | { status: 'ok'; value: T; at: number }
  | { status: 'failed' | 'timeout'; at: number; error?: string }

export interface SingleFlightOptions { ttlMs: number; timeoutMs: number }

export function createSingleFlight<T>(run: (signal: AbortSignal) => Promise<T>, opts: SingleFlightOptions): () => Promise<Outcome<T>> {
  let cache: Outcome<T> | null = null
  let inflight: Promise<Outcome<T>> | null = null

  async function execute(): Promise<Outcome<T>> {
    const ctl = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<'timeout'>(resolve => { timer = setTimeout(() => resolve('timeout'), opts.timeoutMs) })
    try {
      const attempt = (async () => run(ctl.signal))().then(value => ({ value }), (e: unknown) => ({ error: e }))
      const first = await Promise.race([attempt, timeout])
      if (first === 'timeout') { ctl.abort(); return { status: 'timeout', at: Date.now() } }
      if ('error' in first) return { status: 'failed', at: Date.now(), error: first.error instanceof Error ? first.error.message : String(first.error) }
      return { status: 'ok', value: first.value, at: Date.now() }
    } finally {
      clearTimeout(timer)
    }
  }

  return async function get() {
    if (cache && Date.now() - cache.at < opts.ttlMs) return cache
    if (!inflight) {
      inflight = execute().then(outcome => { cache = outcome; inflight = null; return outcome })
    }
    return inflight
  }
}
