import { getCurrentScope, onScopeDispose, ref } from 'vue'
import type { Ref } from 'vue'

// A ref of Date.now() that moves every 30 s, so ages on screen keep counting between polls.
// Client only: during prerender no timer starts, so the generate process has nothing live to leak.
export function useNow(everyMs = 30_000): Ref<number> {
  const now = ref(Date.now())
  if (import.meta.client) {
    const timer = setInterval(() => { now.value = Date.now() }, everyMs)
    if (getCurrentScope()) onScopeDispose(() => clearInterval(timer))
  }
  return now
}
