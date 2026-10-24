import { computed, effectScope, getCurrentScope, onMounted, onScopeDispose, shallowRef, watch } from 'vue'
import type { EffectScope } from 'vue'
import { useOculusPoll } from './useOculusPoll'

// A poll that starts again when its key changes (a filter, a ticket): the old poll stops, the new one loads at once.
// key() returns null while there is nothing to load. Starts after mount, so a prerender leaves no timer running.
export function useRestartingPoll<T>(key: () => string | null, load: (key: string) => Promise<T>) {
  const current = shallowRef<ReturnType<typeof useOculusPoll<T>> | null>(null)
  let scope: EffectScope | undefined
  function stop(): void { scope?.stop(); scope = undefined; current.value = null }
  function start(k: string | null): void {
    stop()
    if (k === null) return
    scope = effectScope(true)
    current.value = scope.run(() => useOculusPoll(() => load(k))) ?? null
  }
  onMounted(() => { watch(key, start, { immediate: true }) })
  if (getCurrentScope()) onScopeDispose(stop)
  return {
    data: computed(() => current.value?.data.value ?? null),
    error: computed(() => current.value?.error.value ?? false),
    failedAt: computed(() => current.value?.failedAt.value ?? null),
    refresh: async (): Promise<void> => { await current.value?.refresh() },
    stop,
  }
}
