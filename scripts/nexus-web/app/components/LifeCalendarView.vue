<script setup lang="ts">
import type { LifeState } from '../types'

const props = defineProps<{ state: LifeState; retrying: boolean }>()
defineEmits<{ retry: [] }>()
const meta = computed(() => {
  const s = props.state
  if (s.kind === 'loading') return 'Loading your calendar…'
  if (s.kind === 'loaded') return `Updated ${s.data.readAtUtc7.slice(11, 16)}, UTC+7`
  return 'Not available'
})
</script>

<template>
  <WidgetFrame title="Life Calendar" :meta="meta">
    <div id="calendar" class="area">
      <LifeCalendarLoaded v-if="state.kind === 'loaded'" :data="state.data" />
      <template v-else>
        <StatsBar :totals="null" :loading="state.kind === 'loading'" />
        <CalendarLegend />
        <GridSkeleton :rows="90" :ghost="state.kind !== 'loading'" />
        <StatePanel v-if="state.kind !== 'loading'" class="over" :kind="state.kind" :retrying="retrying" @retry="$emit('retry')" />
        <p class="note">Weeks count from each birthday. The last box of a year takes the extra day or two.</p>
      </template>
    </div>
  </WidgetFrame>
</template>

<style scoped lang="scss">
.area { position: relative; }
.note { margin: 16px 0 0; color: var(--ink-2); font-size: 13px; }
.over { position: absolute; left: 50%; top: 120px; transform: translateX(-50%); width: min(360px, 100%); }
</style>
