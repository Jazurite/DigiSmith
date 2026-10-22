// scripts/nexus-web/app/composables/useNightwatchPoll.ts
import { onScopeDispose, ref } from 'vue'

export interface PollOptions { intervalMs?: number; backoffMs?: number; now?: () => number }

// Waits 10 s after each answer (no overlap). A failed load keeps the last data and waits 30 s. A hidden tab pauses it.
export function useNightwatchPoll<T>(load: () => Promise<T>, opts: PollOptions = {}) {
  const interval = opts.intervalMs ?? 10_000
  const backoff = opts.backoffMs ?? 30_000
  const now = opts.now ?? Date.now
  const data = ref<T | null>(null)
  const error = ref(false)
  const loading = ref(true)
  const updatedAt = ref<number | null>(null)
  const failedAt = ref<number | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  let busy = false

  const hidden = (): boolean => typeof document !== 'undefined' && document.visibilityState === 'hidden'
  const schedule = (ms: number): void => { if (timer) clearTimeout(timer); if (!stopped) timer = setTimeout(() => { void refresh() }, ms) }

  async function refresh(): Promise<void> {
    if (stopped || busy) return
    if (hidden()) return   // the visibilitychange handler loads again when the tab shows
    busy = true
    try {
      data.value = await load()
      error.value = false
      updatedAt.value = now()
      schedule(interval)
    } catch {
      error.value = true
      failedAt.value = now()
      schedule(backoff)
    } finally {
      loading.value = false
      busy = false
    }
  }
  function onVisible(): void {
    if (hidden()) { if (timer) clearTimeout(timer); return }
    void refresh()
  }
  function stop(): void {
    stopped = true
    if (timer) clearTimeout(timer)
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible)
  }
  onScopeDispose(stop)
  // Client only: a prerender must not start a load or a timer (a failed server-side load retried every 30 s and kept `nuxt generate` alive).
  if (import.meta.client) {
    document.addEventListener('visibilitychange', onVisible)
    void refresh()
  }
  return { data, error, loading, updatedAt, failedAt, refresh, stop }
}
