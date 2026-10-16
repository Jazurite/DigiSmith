<script setup lang="ts">
import type { LifeCalendar } from '#life-schema'
defineProps<{ data: LifeCalendar }>()
</script>

<template>
  <div class="loaded">
    <StatsBar :totals="data.totals" :loading="false" />
    <CalendarLegend />
    <CalendarGrid :key="data.today + data.readAt" :data="data" />
    <p class="note">Weeks count from each birthday. The last box of a year takes the extra day or two.</p>
  </div>
</template>

<style scoped lang="scss">
.note { margin: 16px 0 0; color: var(--ink-2); font-size: 13px; }
</style>
