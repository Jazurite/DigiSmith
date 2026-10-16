<script setup lang="ts">
// The date depends on "now", so it is drawn on the client only, in a slot of fixed size: the prerendered HTML is never stale and never shifts.
const date = ref('')
onMounted(() => { date.value = formatHeaderDate(Date.now()) })
</script>

<template>
  <header class="top">
    <span class="wordmark">pazurite</span>
    <span class="date"><span class="sr-only">Today: </span>{{ date || ' ' }}</span>
  </header>
</template>

<style scoped lang="scss">
.top { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; max-width: 1000px; margin: 0 auto; padding: 16px 16px 12px; border-bottom: 1px solid var(--line); box-sizing: border-box; }
@media (min-width: 640px) { .top { padding-inline: 32px; } }
.wordmark { font-weight: 650; letter-spacing: -0.01em; }
.date { min-width: 22ch; text-align: right; color: var(--ink-2); font-size: 13px; font-variant-numeric: tabular-nums; white-space: nowrap; }
</style>
