// Renders a long list in chunks so no single task builds the whole thing: the first chunk at once, then one chunk per idle callback.
export interface ChunkScheduler {
  /** rows rendered so far */
  shown(): number
  /** schedule the remaining chunks, one per idle callback */
  start(): void
  /** render, now and synchronously, every chunk up to and including the one holding this row index */
  ensure(row: number): void
  /** render everything that is left, now */
  flush(): void
  stop(): void
}
export interface SchedulerOptions {
  total: number
  size: number
  onChange: (shown: number) => void
  schedule?: (run: () => void) => unknown
  cancel?: (handle: unknown) => void
}

export function idleSchedule(run: () => void): unknown {
  if (typeof requestIdleCallback === 'function') return requestIdleCallback(run, { timeout: 250 })
  return setTimeout(run, 16)
}
export function idleCancel(handle: unknown): void {
  if (typeof cancelIdleCallback === 'function' && typeof requestIdleCallback === 'function') cancelIdleCallback(handle as number)
  else clearTimeout(handle as ReturnType<typeof setTimeout>)
}

export function createChunkScheduler(o: SchedulerOptions): ChunkScheduler {
  const schedule = o.schedule ?? idleSchedule
  const cancel = o.cancel ?? idleCancel
  let shown = Math.min(o.size, o.total)
  let handle: unknown = null
  const set = (n: number) => { const v = Math.min(o.total, n); if (v > shown) { shown = v; o.onChange(shown) } }
  function step() {
    handle = null
    set(shown + o.size)
    if (shown < o.total) handle = schedule(step)
  }
  return {
    shown: () => shown,
    start() { if (handle === null && shown < o.total) handle = schedule(step) },
    ensure(row) { set(Math.ceil((row + 1) / o.size) * o.size) },
    flush() { set(o.total) },
    stop() { if (handle !== null) { cancel(handle); handle = null } },
  }
}
