<script setup lang="ts">
import { computed } from 'vue'
import type { Live, Overview } from '#oculus-schema'
import { ageOf, fmtClock, fmtTokens, fmtUsd, fmtUtc7 } from '../../utils/oc-format'

const props = defineProps<{ overview: Overview | null; stale: boolean; updatedAt: number | null; live?: Live | null; liveStale?: boolean }>()
const count = (s: string): number => props.live?.agents.filter((a) => a.status === s).length ?? 0

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
const pct = (w: { usedPct: number } | null): string => (w === null ? '-' : `${Math.round(w.usedPct)}%`)
const mode = computed(() => (props.overview?.scan.away ? 'away' : props.overview?.scan.nightWindow ? 'night' : 'day'))
const stamp = computed(() => (props.updatedAt === null ? '-' : fmtClock(props.updatedAt)))
</script>

<template>
  <div class="bar" role="group" aria-label="Nexus status">
    <span v-if="health" role="status"><i class="dot" :class="[health.tone, { hollow: health.hollow }]" aria-hidden="true" /><b>{{ health.label }}</b></span>
    <span v-else class="muted" role="status">Nexus loading</span>
    <NuxtLink v-if="live" to="/#agents" class="agents" :class="{ warn: live.herdr.state === 'disconnected' || liveStale }">Agents <b>{{ live.agents.length }}</b> · working <b>{{ count('working') }}</b> · blocked <b>{{ count('blocked') }}</b><template v-if="live.herdr.state === 'disconnected'"> · disconnected</template></NuxtLink>
    <span v-else>Agents <b>-</b></span>
    <template v-if="overview">
      <span>Workers <b>{{ overview.workers.length }}</b></span>
      <span>To do (autonomous) waiting <b>{{ overview.scan.candidates ?? '-' }}</b> <span class="muted">as of {{ fmtUtc7(overview.scan.lastScanAt) }}</span></span>
      <span>Mode <b>{{ mode }}</b></span>
    </template>
    <span :title="overview?.burn ? `as of ${fmtUtc7(overview.burn.asOf)} (UTC+7)` : 'no burn reading in the last 15 min'">Burn <b>{{ overview?.burn ? `${fmtTokens(overview.burn.tokensPerH)}/h · ${fmtUsd(overview.burn.usdPerH)}/h` : '-/h' }}</b></span>
    <span class="seats" role="group" aria-label="Seat windows">
      <template v-if="overview?.seats">
        <span v-for="s in overview.seats.seats" :key="s.seat" :class="{ warn: s.stale }">{{ s.seat }} 5h <b>{{ pct(s.fiveHour) }}</b> · wk <b>{{ pct(s.weekly) }}</b><span v-if="s.stale" class="muted"> as of {{ fmtUtc7(s.readAt) }}</span></span>
      </template>
      <span v-else title="no seat file in the last 15 min">Seats <b>-</b></span>
    </span>
    <span class="sp" />
    <span class="muted" aria-live="off">updated <time v-if="updatedAt !== null" :datetime="new Date(updatedAt).toISOString()">{{ stamp }}</time><template v-else>{{ stamp }}</template> (UTC+7)</span>
  </div>
</template>

<style scoped lang="scss">
.bar { display: flex; flex-wrap: wrap; gap: 6px 18px; align-items: center; padding: 10px max(24px, env(safe-area-inset-right)) 10px max(24px, env(safe-area-inset-left)); border-bottom: 1px solid var(--oc-border); font: 11px/14px var(--oc-mono); letter-spacing: 0.04em; text-transform: uppercase; color: var(--oc-text-2); }
b { color: var(--oc-text); font-weight: 600; }
.sp { flex: 1; }
.muted { color: var(--oc-text-3); }
.dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; background: var(--oc-neutral); }
.dot.ok { background: var(--oc-ok); }
.dot.warn { background: var(--oc-warn); }
.dot.bad { background: var(--oc-bad); }
.dot.hollow { background: transparent; box-shadow: inset 0 0 0 1.5px var(--oc-neutral); }
.agents { color: inherit; text-decoration: none; min-height: 24px; display: inline-flex; align-items: center; gap: 0.5ch; }
.agents:focus-visible { outline: 2px solid var(--oc-primary); }
.agents.warn { color: var(--oc-warn); }
.seats { display: inline-flex; gap: 6px 14px; flex-wrap: wrap; }
.warn, .warn b { color: var(--oc-warn); }
@media (max-width: 760px) { .bar { padding: 10px max(16px, env(safe-area-inset-right)) 10px max(16px, env(safe-area-inset-left)); } .seats { flex-basis: 100%; } }
</style>
