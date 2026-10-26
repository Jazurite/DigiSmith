<script setup lang="ts">
import { computed } from 'vue'
import type { RunDetail } from '#oculus-schema'
import { fmtMinutes } from '../../utils/oc-format'

const props = defineProps<{ budget: RunDetail['budget']; phaseSince?: string | null; nowMs?: number }>()
const active = computed(() => props.budget.phase !== null && props.budget.limitMin !== null && props.budget.elapsedMin !== null)
const limit = computed(() => props.budget.limitMin ?? 0)
// with phaseSince the minutes follow the page clock; without it they stay the snapshot value of the poll
const view = (now: number): { elapsed: number; over: boolean; pct: number } => {
  const since = props.phaseSince ? Date.parse(props.phaseSince) : NaN
  const elapsed = Number.isFinite(since) ? Math.max(0, Math.floor((now - since) / 60_000)) : props.budget.elapsedMin ?? 0
  return { elapsed, over: limit.value > 0 && elapsed > limit.value, pct: limit.value > 0 ? Math.min(100, Math.round((elapsed / limit.value) * 100)) : 0 }
}
</script>

<template>
  <OcCard title="Budget" note="watchdog">
    <div class="body">
      <OcTick v-if="active" v-slot="{ nowMs: t }" :now-ms="nowMs">
        <template v-for="v in [view(t)]" :key="0">
          <div class="mono" :class="{ over: v.over }">{{ budget.phase }} {{ fmtMinutes(v.elapsed) }} of {{ limit }} min<template v-if="v.over"> (over budget)</template></div>
          <div class="track" role="progressbar" :aria-label="`${budget.phase} time used`" aria-valuemin="0" :aria-valuemax="limit" :aria-valuenow="Math.min(v.elapsed, limit)" :aria-valuetext="`${v.elapsed} of ${limit} min`"><i :class="{ over: v.over }" :style="{ width: `${v.pct}%` }" /></div>
        </template>
      </OcTick>
      <div v-else class="mono muted">No phase is running.</div>
      <div class="mono muted">building {{ budget.building }} min · review {{ budget.review }} min · merge {{ budget.merge }} min</div>
    </div>
  </OcCard>
</template>

<style scoped lang="scss">
.body { padding: 12px 14px; font-size: 11px; }
.mono { font-family: var(--oc-mono); }
.muted { color: var(--oc-text-3); }
.over { color: var(--oc-bad); }
.track { height: 6px; background: var(--oc-raised); border-radius: var(--oc-radius-xs); margin: 4px 0 10px; overflow: hidden; }
.track i { display: block; height: 100%; background: var(--oc-primary); }
.track i.over { background: var(--oc-bad); }
</style>
