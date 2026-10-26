import { computed, getCurrentInstance, getCurrentScope, onScopeDispose, provide, ref, toValue, watch } from 'vue'
import type { InjectionKey, MaybeRefOrGetter, Ref } from 'vue'

export const FAST_MS = 1_000
export const SLOW_MS = 30_000
export const NOW_KEY: InjectionKey<Ref<number>> = Symbol('oculus-now')

// A ref of Date.now(). It moves every second while the tab is visible and `fast` is true (a shown run is running),
// otherwise every 30 s, so ages on screen keep counting between polls. Inside a component it is also provided as NOW_KEY.
// Client only: during prerender no timer and no listener start, so the generate process has nothing live to leak.
export function useNow(opts: { fast?: MaybeRefOrGetter<boolean> } = {}): Ref<number> {
  const now = ref(Date.now())
  if (getCurrentInstance()) provide(NOW_KEY, now)
  if (import.meta.client) {
    const visible = ref(document.visibilityState !== 'hidden')
    const rate = computed(() => (visible.value && toValue(opts.fast) === true ? FAST_MS : SLOW_MS))
    let timer: ReturnType<typeof setInterval> | undefined
    // sync: a change of rate restarts the one timer in the same tick; the new rate shows the right time at once
    watch(rate, (ms) => {
      clearInterval(timer)
      now.value = Date.now()
      timer = setInterval(() => { now.value = Date.now() }, ms)
    }, { immediate: true, flush: 'sync' })
    const onVisibility = (): void => { visible.value = document.visibilityState !== 'hidden'; if (visible.value) now.value = Date.now() }
    document.addEventListener('visibilitychange', onVisibility)
    if (getCurrentScope()) onScopeDispose(() => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility) })
  }
  return now
}
