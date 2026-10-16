<script setup lang="ts">
import type { LifeState } from '../types'

const state = ref<LifeState>({ kind: 'loading' })
const retrying = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

async function load(isRetry = false) {
  retrying.value = isRetry
  const next = await loadLifeCalendar()
  const recovered = isRetry && next.kind === 'loaded'
  state.value = next
  retrying.value = false
  // until this week's row is drawn the grid itself is the tab stop and hands the focus on
  if (recovered) { await nextTick(); const grid = document.getElementById('calendar-grid'); (grid?.querySelector<HTMLElement>('[tabindex="0"]') ?? grid)?.focus() }
}
function scheduleMidnight() {
  timer = setTimeout(async () => { await load(); scheduleMidnight() }, msUntilNextMidnightUtc7(Date.now()) + 1000)
}
onMounted(() => { load(); scheduleMidnight() })
onBeforeUnmount(() => { if (timer) clearTimeout(timer) })
</script>

<template>
  <LifeCalendarView :state="state" :retrying="retrying" @retry="load(true)" />
</template>
