<script setup lang="ts">
import type { RunRow } from '#oculus-schema'
import { fmtDuration } from '../../utils/oc-format'

defineProps<{ workers: RunRow[]; nowMs: number }>()
// a running row counts up from startedAt; an ended row keeps its frozen elapsedSec
// a Maestro or conductor run is never classified (DGS-598): no health flag, a plain "-"
const unflagged = (w: RunRow): boolean => w.role === 'maestro' || w.role === 'conductor'
const elapsed = (w: RunRow, nowMs: number): string => fmtDuration(w.endedAt ? w.elapsedSec : Math.max(0, (nowMs - Date.parse(w.startedAt)) / 1000))
</script>

<template>
  <OcCard title="Active workers" :note="`${workers.length} running`">
    <p v-if="workers.length === 0" class="empty">No worker is running. The next scan starts at 00:00 (UTC+7).</p>
    <OcTable v-else caption="Active workers">
      <template #head>
        <tr><th scope="col">Health</th><th scope="col">Key</th><th scope="col">Role</th><th scope="col">Seat</th><th scope="col">Phase</th><th scope="col" class="num">Elapsed</th><th scope="col" class="num">Tokens</th></tr>
      </template>
      <tr v-for="w in workers" :key="w.run">
        <td data-label="Health"><span v-if="unflagged(w)" class="muted">-</span><OcStatus v-else :state="w.state" /></td>
        <td data-label="Key" class="mono"><NuxtLink :to="`/run/?id=${encodeURIComponent(w.run)}`">{{ w.ticket ?? w.run }}</NuxtLink></td>
        <td data-label="Role">{{ w.role }}</td>
        <td data-label="Seat" class="mono">{{ w.seat ?? '-' }}</td>
        <td data-label="Phase" class="mono">{{ w.phase ?? '-' }}</td>
        <td data-label="Elapsed" class="num">{{ elapsed(w, nowMs) }}</td>
        <td data-label="Tokens" class="num muted" title="not measured">-</td>
      </tr>
    </OcTable>
  </OcCard>
</template>
