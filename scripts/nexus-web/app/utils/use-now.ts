import { onScopeDispose, ref } from 'vue'
import type { Ref } from 'vue'

// A ref of Date.now() that moves every 30 s, so ages on screen keep counting between polls.
export function useNow(everyMs = 30_000): Ref<number> {
  const now = ref(Date.now())
  const timer = setInterval(() => { now.value = Date.now() }, everyMs)
  onScopeDispose(() => clearInterval(timer))
  return now
}
