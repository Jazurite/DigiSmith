<script setup lang="ts">
import { computed } from 'vue'
import type { RunDetail } from '#oculus-schema'
import { fmtMinutes } from '../../utils/nw-format'

const props = defineProps<{ budget: RunDetail['budget'] }>()
const active = computed(() => props.budget.phase !== null && props.budget.limitMin !== null && props.budget.elapsedMin !== null)
const elapsed = computed(() => props.budget.elapsedMin ?? 0)
const limit = computed(() => props.budget.limitMin ?? 0)
const over = computed(() => limit.value > 0 && elapsed.value > limit.value)
const pct = computed(() => (limit.value > 0 ? Math.min(100, Math.round((elapsed.value / limit.value) * 100)) : 0))
</script>

<template>
  <NwCard title="Budget" note="watchdog">
    <div class="body">
      <template v-if="active">
        <div class="mono" :class="{ over }">{{ budget.phase }} {{ fmtMinutes(elapsed) }} of {{ limit }} min<template v-if="over"> (over budget)</template></div>
        <div class="track" role="progressbar" :aria-label="`${budget.phase} time used`" aria-valuemin="0" :aria-valuemax="limit" :aria-valuenow="Math.min(elapsed, limit)" :aria-valuetext="`${elapsed} of ${limit} min`"><i :class="{ over }" :style="{ width: `${pct}%` }" /></div>
      </template>
      <div v-else class="mono muted">No phase is running.</div>
      <div class="mono muted">building {{ budget.building }} min · review {{ budget.review }} min · merge {{ budget.merge }} min</div>
    </div>
  </NwCard>
</template>

<style scoped lang="scss">
.body { padding: 12px 14px; font-size: 11px; }
.mono { font-family: var(--nw-mono); }
.muted { color: var(--nw-text-3); }
.over { color: var(--nw-bad); }
.track { height: 6px; background: var(--nw-raised); border-radius: var(--nw-radius-xs); margin: 4px 0 10px; overflow: hidden; }
.track i { display: block; height: 100%; background: var(--nw-primary); }
.track i.over { background: var(--nw-bad); }
</style>
