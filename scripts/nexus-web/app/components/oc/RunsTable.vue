<script setup lang="ts">
import type { RunRow } from '#oculus-schema'
import { fmtDay, fmtDuration } from '../../utils/oc-format'

defineProps<{ runs: RunRow[]; nowMs: number }>()
// a running row counts up from startedAt; an ended row keeps its frozen elapsedSec
const duration = (r: RunRow, nowMs: number): string => fmtDuration(r.endedAt ? r.elapsedSec : Math.max(0, (nowMs - Date.parse(r.startedAt)) / 1000))
const delivery = (r: RunRow): string => [r.merged ? 'merged' : '', r.pushed ? 'pushed' : ''].filter(Boolean).join(' · ') || '-'
</script>

<template>
  <OcCard title="Runs" :note="`${runs.length} shown, times UTC+7`">
    <p v-if="runs.length === 0" class="empty">No run yet.</p>
    <OcTable v-else caption="Runs">
      <template #head>
        <tr><th scope="col">State</th><th scope="col">Key</th><th scope="col">Role</th><th scope="col">Seat / model</th><th scope="col">Trigger</th><th scope="col">Started</th><th scope="col" class="num">Duration</th><th scope="col" class="num">Tokens</th><th scope="col">Delivery</th></tr>
      </template>
      <tr v-for="r in runs" :key="r.run">
        <td data-label="State"><OcStatus :state="r.state" /></td>
        <td data-label="Key" class="mono"><NuxtLink :to="`/run/?id=${encodeURIComponent(r.run)}`">{{ r.ticket ?? '-' }}</NuxtLink></td>
        <td data-label="Role">{{ r.role }}</td>
        <td data-label="Seat / model" class="mono">{{ r.seat ?? '-' }} · {{ r.model ?? '-' }}</td>
        <td data-label="Trigger">{{ r.trigger }}</td>
        <td data-label="Started" class="mono">{{ fmtDay(r.startedAt) }}</td>
        <td data-label="Duration" class="num">{{ duration(r, nowMs) }}</td>
        <td data-label="Tokens" class="num muted" title="not measured">-</td>
        <td data-label="Delivery" :class="{ muted: delivery(r) === '-' }">{{ delivery(r) }}</td>
      </tr>
    </OcTable>
  </OcCard>
</template>
