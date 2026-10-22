<script setup lang="ts">
import { computed } from 'vue'
import type { Overview } from '#nightwatch-schema'
import { ageOf, fmtClock, fmtUtc7 } from '../../utils/nw-format'

const props = defineProps<{ overview: Overview | null; stale: boolean; updatedAt: number | null }>()

type Tone = 'ok' | 'warn' | 'bad' | 'neutral'
const health = computed<{ label: string; tone: Tone; hollow: boolean } | null>(() => {
  const o = props.overview
  if (!o) return props.stale ? { label: 'Nexus unreachable', tone: 'bad', hollow: false } : null
  if (props.stale) {   // the last poll failed: the data is old, so never show its green
    const age = props.updatedAt === null ? '' : ` ${ageOf(new Date(props.updatedAt).toISOString(), Date.now())}`
    return { label: `Nexus stale${age}`, tone: 'warn', hollow: false }
  }
  switch (o.nexus.status) {
    case 'healthy': return { label: 'Nexus healthy', tone: 'ok', hollow: false }
    case 'degraded': return { label: 'Nexus degraded', tone: 'warn', hollow: false }
    case 'breaker-open': return { label: 'Breaker open', tone: 'bad', hollow: false }
    default: return { label: 'Nexus unknown', tone: 'neutral', hollow: true }   // never a green look
  }
})
const mode = computed(() => (props.overview?.scan.away ? 'away' : props.overview?.scan.nightWindow ? 'night' : 'day'))
const stamp = computed(() => (props.updatedAt === null ? '-' : fmtClock(props.updatedAt)))
</script>

<template>
  <div class="bar" role="group" aria-label="Nexus status">
    <span v-if="health" role="status"><i class="dot" :class="[health.tone, { hollow: health.hollow }]" aria-hidden="true" /><b>{{ health.label }}</b></span>
    <span v-else class="muted" role="status">Nexus loading</span>
    <template v-if="overview">
      <span>Workers <b>{{ overview.workers.length }}</b></span>
      <span>To do waiting <b>{{ overview.scan.candidates ?? '-' }}</b> <span class="muted">as of {{ fmtUtc7(overview.scan.lastScanAt) }}</span></span>
      <span>Mode <b>{{ mode }}</b></span>
    </template>
    <span title="not measured">Burn <b>-</b>/h</span>
    <span title="not measured">Seat 5h / week <b>- / -</b></span>
    <span class="sp" />
    <span class="muted" aria-live="off">updated <time v-if="updatedAt !== null" :datetime="new Date(updatedAt).toISOString()">{{ stamp }}</time><template v-else>{{ stamp }}</template> (UTC+7)</span>
  </div>
</template>

<style scoped lang="scss">
.bar { display: flex; flex-wrap: wrap; gap: 6px 18px; align-items: center; padding: 10px 24px; border-bottom: 1px solid var(--nw-border); font: 11px/14px var(--nw-mono); letter-spacing: 0.04em; text-transform: uppercase; color: var(--nw-text-2); }
b { color: var(--nw-text); font-weight: 600; }
.sp { flex: 1; }
.muted { color: var(--nw-text-3); }
.dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; background: var(--nw-neutral); }
.dot.ok { background: var(--nw-ok); }
.dot.warn { background: var(--nw-warn); }
.dot.bad { background: var(--nw-bad); }
.dot.hollow { background: transparent; box-shadow: inset 0 0 0 1.5px var(--nw-neutral); }
@media (max-width: 760px) { .bar { padding: 10px 16px; } }
</style>
