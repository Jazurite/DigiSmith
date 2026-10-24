<script setup lang="ts">
import type { RunRow } from '#oculus-schema'
import { fmtDay, fmtDuration, fmtMinutes, fmtTokens, fmtUsd, fmtUtc7, phaseTime, spokenMinutes, spokenSeconds } from '../../utils/oc-format'

defineProps<{ runs: RunRow[]; nowMs: number }>()
// a running row counts up from startedAt; an ended row keeps its frozen elapsedSec
const totalSec = (r: RunRow, nowMs: number): number => (r.endedAt ? r.elapsedSec : Math.max(0, (nowMs - Date.parse(r.startedAt)) / 1000))
const duration = (r: RunRow, nowMs: number): string => fmtDuration(totalSec(r, nowMs))
// "0:31:07 · building 0:14" on screen; screen readers get words, not the "·" and h:mm
const spoken = (r: RunRow, nowMs: number): string => {
  const p = phaseTime(r, nowMs)
  return p ? `${spokenSeconds(totalSec(r, nowMs))}, ${p.phase} for ${spokenMinutes(p.min)}` : spokenSeconds(totalSec(r, nowMs))
}
// a Maestro or conductor run is never classified (DGS-598): no health flag, a plain "-"
const unflagged = (r: RunRow): boolean => r.role === 'maestro' || r.role === 'conductor'
// a missing snapshot says why (DGS-590): stale since a time, or none at all
const missingWhy = (r: RunRow): string => (r.tokensAsOf ? `stale since ${fmtUtc7(r.tokensAsOf)} (UTC+7)` : 'no snapshot')
const costTitle = (r: RunRow): string =>
  !r.tokens ? missingWhy(r) : r.tokens.costUsd === null ? `unpriced model: ${r.tokens.unpriced.join(', ')}` : `list price $${r.tokens.costUsd.toFixed(4)}`
const delivery = (r: RunRow): string => [r.merged ? 'merged' : '', r.pushed ? 'pushed' : ''].filter(Boolean).join(' · ') || '-'
</script>

<template>
  <OcCard title="Runs" :note="`${runs.length} shown, times UTC+7`">
    <p v-if="runs.length === 0" class="empty">No run yet.</p>
    <OcTable v-else caption="Runs">
      <template #head>
        <tr><th scope="col">State</th><th scope="col">Key</th><th scope="col">Role</th><th scope="col">Project</th><th scope="col">Seat / model</th><th scope="col">Trigger</th><th scope="col">Started</th><th scope="col" class="num">Duration</th><th scope="col" class="num">Tokens</th><th scope="col" class="num">Cost</th><th scope="col">Delivery</th></tr>
      </template>
      <tr v-for="r in runs" :key="r.run">
        <td data-label="State"><span v-if="unflagged(r)" class="muted">-</span><OcStatus v-else :state="r.state" /></td>
        <td data-label="Key" class="mono"><NuxtLink :to="`/run/?id=${encodeURIComponent(r.run)}`">{{ r.ticket ?? '-' }}</NuxtLink></td>
        <td data-label="Role">{{ r.role }}</td>
        <td data-label="Project" :class="{ muted: !r.project }">{{ r.project ?? '-' }}</td>
        <td data-label="Seat / model" class="mono">{{ r.seat ?? '-' }} · {{ r.model ?? '-' }}</td>
        <td data-label="Trigger">{{ r.trigger }}</td>
        <td data-label="Started" class="mono">{{ fmtDay(r.startedAt) }}</td>
        <td data-label="Duration" class="num">
          <span aria-hidden="true">{{ duration(r, nowMs) }}<template v-if="phaseTime(r, nowMs)"> · <span class="phase">{{ phaseTime(r, nowMs)!.phase }} {{ fmtMinutes(phaseTime(r, nowMs)!.min) }}</span></template></span>
          <span class="sr">{{ spoken(r, nowMs) }}</span>
        </td>
        <td data-label="Tokens" class="num" :class="{ muted: !r.tokens }" :title="r.tokens ? String(r.tokens.total) : missingWhy(r)">{{ r.tokens ? fmtTokens(r.tokens.total) : '-' }}</td>
        <td data-label="Cost" class="num" :class="{ muted: !r.tokens || r.tokens.costUsd === null }" :title="costTitle(r)">{{ r.tokens ? fmtUsd(r.tokens.costUsd) : '-' }}</td>
        <td data-label="Delivery" :class="{ muted: delivery(r) === '-' }">{{ delivery(r) }}</td>
      </tr>
    </OcTable>
  </OcCard>
</template>

<style scoped lang="scss">
.phase { white-space: nowrap; }
</style>
