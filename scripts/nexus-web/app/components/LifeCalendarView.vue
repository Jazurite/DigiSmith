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
      <div v-else class="placeholder" aria-hidden="true" />
      <StatePanel v-if="state.kind === 'error' || state.kind === 'locked' || state.kind === 'empty'" class="over" :kind="state.kind" :retrying="retrying" @retry="$emit('retry')" />
    </div>
  </WidgetFrame>
</template>

<style scoped lang="scss">
.area { position: relative; }
.placeholder { height: 240px; }
.over { position: absolute; left: 50%; top: 32px; transform: translateX(-50%); width: min(360px, 100%); }
</style>
