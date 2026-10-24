<script setup lang="ts">
import type { Overview } from '#nightwatch-schema'
import { fmtDuration } from '../../utils/nw-format'

defineProps<{ rows: Overview['tickets']['rows']; lockTicket: string | null; windowDays: number; nowMs: number }>()
const TONE = { claimed: 'warn', building: 'running', review: 'running', 'merge-ready': 'warn', merged: 'ok', released: 'ok', lost: 'bad' } as const
const oldest = (since: string | null, nowMs: number): string => (since ? fmtDuration((nowMs - Date.parse(since)) / 1000) : '-')
</script>

<template>
  <NwCard title="Tickets per phase" :note="`window ${windowDays} days`">
    <NwTable caption="Tickets per phase" dense>
      <template #head><tr><th scope="col">Phase</th><th scope="col" class="num">Count</th><th scope="col" class="num">Oldest</th></tr></template>
      <tr v-for="r in rows" :key="r.phase">
        <td data-label="Phase"><NwStatus :state="TONE[r.phase]" :label="r.phase" /></td>
        <td data-label="Count" class="num">{{ r.count }}</td>
        <td data-label="Oldest" class="num" :class="{ muted: !r.oldestSince }">{{ oldest(r.oldestSince, nowMs) }}</td>
      </tr>
    </NwTable>
    <p class="foot">one claimed ticket at a time (scan lock) · window: {{ windowDays }} days<template v-if="lockTicket"> · locked: <span class="lock">{{ lockTicket }}</span></template></p>
  </NwCard>
</template>
