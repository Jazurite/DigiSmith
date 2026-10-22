import { getCurrentScope, onScopeDispose, ref } from 'vue'
import type { EventRow } from '#nightwatch-schema'
import { loadEvents, type ApiOptions } from './nightwatch-api'

export type Group = 'all' | 'agent' | 'system' | 'errors'
const PAGE = 200

// Tails one run's event stream. The cursor is the line count of the last answer (`since`), never a time.
// The timers start on the client only, so a prerender leaves nothing running.
export function useEventTail(run: string, opts: ApiOptions & { intervalMs?: number } = {}) {
  const api: ApiOptions = { base: opts.base, fetch: opts.fetch }
  const interval = opts.intervalMs ?? 10_000
  const lines = ref<EventRow[]>([])
  const total = ref(0)
  const group = ref<Group>('all')
  const tail = ref(true)
  const hasEarlier = ref(false)
  const error = ref(false)
  let seen = 0
  let generation = 0   // a group change starts a new generation; an answer from an older one is dropped
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  const g = (): { group?: string } => (group.value === 'all' ? {} : { group: group.value })
  const earlier = (rows: EventRow[]): boolean => rows.length > 0 && rows[0]!.n > 1

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
    } catch { if (mine === generation) error.value = true }
  }
  function schedule(): void { if (!stopped) timer = setTimeout(() => { void poll() }, interval) }
  async function poll(): Promise<void> {
    if (stopped) return
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
      } catch { error.value = true }
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
    } catch { error.value = true }
  }
  async function setGroup(next: Group): Promise<void> { group.value = next; await first() }

  function stop(): void { stopped = true; if (timer) clearTimeout(timer) }
  if (import.meta.client) void first().then(schedule)
  if (getCurrentScope()) onScopeDispose(stop)
  return { lines, total, group, tail, hasEarlier, error, loadEarlier, setGroup, stop }
}
