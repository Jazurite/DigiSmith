<script setup lang="ts">
import type { LifeCalendar } from '#life-schema'

const props = defineProps<{ totals: LifeCalendar['totals'] | null; loading: boolean }>()
const fmt = (n: number) => n.toLocaleString('en-US')
const lived = computed(() => props.totals ? fmt(props.totals.weeksLived) : undefined)
const left = computed(() => props.totals ? fmt(props.totals.weeksLeft) : undefined)
const percent = computed(() => props.totals ? `${props.totals.percentLived.toFixed(1)}%` : undefined)
</script>

<template>
  <div :aria-busy="loading ? 'true' : 'false'">
    <dl class="stats">
      <StatItem label="weeks lived" :value="lived" :loading="loading" />
      <StatItem label="weeks left" :value="left" :loading="loading" />
      <StatItem label="lived" :value="percent" :loading="loading" />
    </dl>
  </div>
</template>

<style scoped lang="scss">
.stats { display: flex; gap: 28px; margin: 0 0 16px; flex-wrap: nowrap; }
@media (min-width: 640px) { .stats { gap: 56px; } }
</style>
