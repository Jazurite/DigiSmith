import { getCurrentScope, onScopeDispose, ref } from 'vue'
import type { EventRow } from '#nightwatch-schema'
import { loadEvents, type ApiOptions } from './nightwatch-api'

export type Group = 'all' | 'agent' | 'system' | 'errors'
const PAGE = 200

// Tails one run's event stream. The cursor is the line count of the last answer (`since`), never a time.
// The timers start on the client only, so a prerender leaves nothing running.
export function useEventTail(run: string, opts: ApiOptions & { intervalMs?: number; backoffMs?: number } = {}) {
  const api: ApiOptions = { base: opts.base, fetch: opts.fetch }
  const interval = opts.intervalMs ?? 10_000
  const backoff = opts.backoffMs ?? 30_000
  const lines = ref<EventRow[]>([])
  const total = ref(0)
  const group = ref<Group>('all')
  const tail = ref(true)
  const hasEarlier = ref(false)
  const error = ref(false)
  const failedAt = ref<number | null>(null)
  const earlierError = ref(false)   // a failed loadEarlier must not reset the pages already loaded, so it has its own flag
  let seen = 0
  let generation = 0   // a group change starts a new generation; an answer from an older one is dropped
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  const g = (): { group?: string } => (group.value === 'all' ? {} : { group: group.value })
  // Line numbers are run-wide. Without a filter, a first line above 1 means earlier lines exist.
  // With a filter the answer cannot say, so a full page means there may be more; a short page means there is not.
  const earlier = (rows: EventRow[]): boolean => (group.value === 'all' ? rows.length > 0 && rows[0]!.n > 1 : rows.length >= PAGE)

  async function first(): Promise<void> {
    const mine = ++generation
    try {
      const r = await loadEvents(run, { ...g(), tail: PAGE }, api)
      if (mine !== generation) return
      lines.value = r.lines
      total.value = r.total
      seen = r.total
      hasEarlier.value = earlier(r.lines)
      error.value = false
    } catch { if (mine === generation) { error.value = true; failedAt.value = Date.now() } }
  }
  const hidden = (): boolean => typeof document !== 'undefined' && document.visibilityState === 'hidden'
  // 10 s after an answer, 30 s after an error; a hidden tab does not poll (the visibilitychange handler polls again when it shows)
  function schedule(): void { if (timer) clearTimeout(timer); if (!stopped) timer = setTimeout(() => { void poll() }, error.value ? backoff : interval) }
  async function poll(): Promise<void> {
    if (stopped) return
    if (hidden()) return
    if (error.value) {
      await first()
    } else if (tail.value) {
      const mine = generation
      try {
        const r = await loadEvents(run, { since: seen, ...g() }, api)
        if (mine === generation) {
          if (r.lines.length) lines.value = [...lines.value, ...r.lines]
          total.value = r.total
          seen = r.total
        }
      } catch { error.value = true; failedAt.value = Date.now() }
    }
    schedule()
  }
  async function loadEarlier(): Promise<void> {
    const smallest = lines.value[0]?.n
    if (smallest === undefined) return
    const mine = generation
    try {
      const r = await loadEvents(run, { before: smallest, ...g(), tail: PAGE }, api)
      if (mine !== generation) return
      lines.value = [...r.lines, ...lines.value]
      hasEarlier.value = earlier(r.lines)
      earlierError.value = false
    } catch { earlierError.value = true }
  }
  async function setGroup(next: Group): Promise<void> { group.value = next; earlierError.value = false; await first() }

  function onVisible(): void {
    if (hidden()) { if (timer) clearTimeout(timer); return }
    if (timer) clearTimeout(timer)
    void poll()
  }
  function stop(): void { stopped = true; if (timer) clearTimeout(timer); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible) }
  if (import.meta.client) { document.addEventListener('visibilitychange', onVisible); void first().then(schedule) }
  if (getCurrentScope()) onScopeDispose(stop)
  return { lines, total, group, tail, hasEarlier, error, failedAt, earlierError, loadEarlier, setGroup, stop }
}
