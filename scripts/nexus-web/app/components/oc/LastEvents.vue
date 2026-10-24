<script setup lang="ts">
import type { Overview } from '#oculus-schema'
import { fmtUtc7 } from '../../utils/oc-format'

defineProps<{ events: Overview['lastEvents'] }>()
</script>

<template>
  <OcCard title="Last events" note="all open runs, times UTC+7">
    <p v-if="events.length === 0" class="empty">No events yet.</p>
    <OcTable v-else caption="Last events" dense>
      <template #head><tr><th scope="col">Time (UTC+7)</th><th scope="col">Source</th><th scope="col">Kind</th><th scope="col">Event</th></tr></template>
      <tr v-for="(e, i) in events" :key="`${e.ts}-${i}`">
        <td data-label="Time (UTC+7)" class="muted">{{ fmtUtc7(e.ts) }}</td>
        <td data-label="Source">{{ e.source }}</td>
        <td data-label="Kind" :class="{ 'k-bad': e.kind === 'attention', 'k-info': e.kind === 'claim' }">{{ e.kind }}</td>
        <td data-label="Event">{{ e.text }}</td>
      </tr>
    </OcTable>
  </OcCard>
</template>

<style lang="scss">
.oc-table .k-bad { color: var(--oc-bad); }
.oc-table .k-info { color: var(--oc-info); }
</style>
