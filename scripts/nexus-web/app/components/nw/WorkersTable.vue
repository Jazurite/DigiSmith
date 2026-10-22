<script setup lang="ts">
import type { RunRow } from '#nightwatch-schema'
import { fmtDuration } from '../../utils/nw-format'

defineProps<{ workers: RunRow[]; nowMs: number }>()
// a running row counts up from startedAt; an ended row keeps its frozen elapsedSec
const elapsed = (w: RunRow, nowMs: number): string => fmtDuration(w.endedAt ? w.elapsedSec : Math.max(0, (nowMs - Date.parse(w.startedAt)) / 1000))
</script>

<template>
  <NwCard title="Active workers" :note="`${workers.length} running`">
    <p v-if="workers.length === 0" class="empty">No worker is running. The next scan starts at 00:00 (UTC+7).</p>
    <NwTable v-else caption="Active workers">
      <template #head>
        <tr><th scope="col">Health</th><th scope="col">Key</th><th scope="col">Role</th><th scope="col">Seat</th><th scope="col">Phase</th><th scope="col" class="num">Elapsed</th><th scope="col" class="num">Tokens</th></tr>
      </template>
      <tr v-for="w in workers" :key="w.run">
        <td><NwStatus :state="w.state" /></td>
        <td class="mono"><NuxtLink :to="`/nightwatch/run/?id=${encodeURIComponent(w.run)}`">{{ w.ticket ?? w.run }}</NuxtLink></td>
        <td>{{ w.role }}</td>
        <td class="mono">{{ w.seat ?? '-' }}</td>
        <td class="mono">{{ w.phase ?? '-' }}</td>
        <td class="num">{{ elapsed(w, nowMs) }}</td>
        <td class="num muted" title="not measured">-</td>
      </tr>
    </NwTable>
  </NwCard>
</template>
