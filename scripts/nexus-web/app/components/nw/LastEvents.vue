<script setup lang="ts">
import type { Overview } from '#nightwatch-schema'
import { fmtUtc7 } from '../../utils/nw-format'

defineProps<{ events: Overview['lastEvents'] }>()
</script>

<template>
  <NwCard title="Last events" note="all open runs, times UTC+7">
    <p v-if="events.length === 0" class="empty">No events yet.</p>
    <NwTable v-else caption="Last events" dense>
      <template #head><tr><th scope="col">Time (UTC+7)</th><th scope="col">Source</th><th scope="col">Kind</th><th scope="col">Event</th></tr></template>
      <tr v-for="(e, i) in events" :key="`${e.ts}-${i}`">
        <td class="muted">{{ fmtUtc7(e.ts) }}</td>
        <td>{{ e.source }}</td>
        <td :class="{ 'k-bad': e.kind === 'attention', 'k-info': e.kind === 'claim' }">{{ e.kind }}</td>
        <td>{{ e.text }}</td>
      </tr>
    </NwTable>
  </NwCard>
</template>

<style lang="scss">
.nw-table .k-bad { color: var(--nw-bad); }
.nw-table .k-info { color: var(--nw-info); }
</style>
