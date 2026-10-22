<script setup lang="ts">
import { computed } from 'vue'
import type { Overview } from '#nightwatch-schema'
import { fmtDay } from '../../utils/nw-format'

const props = defineProps<{ scan: Overview['scan']; lockTicket: string | null }>()
const mode = computed(() => (props.scan.away ? 'away' : props.scan.nightWindow ? 'night window' : 'day'))
const breaker = computed(() => (props.scan.breakerOpen ? `open (streak ${props.scan.breakerStreak})` : `closed (streak ${props.scan.breakerStreak})`))
</script>

<template>
  <NwCard title="Scan" :note="mode">
    <dl class="kv">
      <dt>Last scan</dt><dd>{{ scan.lastScanAt ? `${fmtDay(scan.lastScanAt)} (UTC+7)` : 'No scan yet' }}</dd>
      <dt>Waiting</dt><dd>{{ scan.candidates ?? '-' }}</dd>
      <dt>Locked ticket</dt><dd>{{ lockTicket ?? 'none' }}</dd>
      <dt>Breaker</dt><dd :class="{ 'k-bad': scan.breakerOpen }">{{ breaker }}</dd>
    </dl>
  </NwCard>
</template>

<style lang="scss">
.nw-card .kv .k-bad { color: var(--nw-bad); }
</style>
