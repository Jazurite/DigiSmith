<script setup lang="ts">
import type { Overview } from '#oculus-schema'
import { fmtDuration } from '../../utils/oc-format'

defineProps<{ rows: Overview['tickets']['rows']; lockTicket: string | null; windowDays: number; nowMs?: number }>()
const TONE = { claimed: 'warn', building: 'running', review: 'running', 'merge-ready': 'warn', merged: 'ok', released: 'ok', lost: 'bad' } as const
const oldest = (since: string | null, nowMs: number): string => (since ? fmtDuration((nowMs - Date.parse(since)) / 1000) : '-')
</script>

<template>
  <OcCard title="Tickets per phase" :note="`window ${windowDays} days`">
    <OcTable caption="Tickets per phase" dense>
      <template #head><tr><th scope="col">Phase</th><th scope="col" class="num">Count</th><th scope="col" class="num">Oldest</th></tr></template>
      <tr v-for="r in rows" :key="r.phase">
        <td data-label="Phase"><OcStatus :state="TONE[r.phase]" :label="r.phase" /></td>
        <td data-label="Count" class="num">{{ r.count }}</td>
        <td data-label="Oldest" class="num" :class="{ muted: !r.oldestSince }"><OcTick v-slot="{ nowMs: t }" :now-ms="nowMs">{{ oldest(r.oldestSince, t) }}</OcTick></td>
      </tr>
    </OcTable>
    <p class="foot">one claimed ticket at a time (scan lock) · window: {{ windowDays }} days<template v-if="lockTicket"> · locked: <span class="lock">{{ lockTicket }}</span></template></p>
  </OcCard>
</template>
