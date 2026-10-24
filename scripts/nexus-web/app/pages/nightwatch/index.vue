<script setup lang="ts">
import { inject } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { Overview } from '#oculus-schema'
import { useNow } from '../../utils/use-now'

definePageMeta({ layout: 'nightwatch' })
useHead({ title: 'Operations · Nightwatch' })
// the layout owns the one overview poll; this page only reads it
const nw = inject<{ overview: Ref<Overview | null>; stale: Ref<boolean>; updatedAt: Ref<number | null>; failedAt: Ref<number | null>; attention: ComputedRef<number>; refresh: () => Promise<void> }>('nwOverview')!
const nowMs = useNow()
</script>

<template>
  <NwPageHead title="Operations" sub="Tickets per phase, active workers and the latest events." />
  <NwPanel v-if="!nw.overview.value && !nw.stale.value" kind="loading" />
  <NwPanel v-else-if="!nw.overview.value" kind="error" title="The operations view is not available right now." @retry="nw.refresh()" />
  <template v-else>
    <NwStaleBanner v-if="nw.stale.value" :failed-at="nw.failedAt.value" />
    <div class="grid">
      <NwPhaseTable :rows="nw.overview.value.tickets.rows" :lock-ticket="nw.overview.value.tickets.lockTicket" :window-days="nw.overview.value.tickets.windowDays" :now-ms="nowMs" />
      <NwScanCard :scan="nw.overview.value.scan" :lock-ticket="nw.overview.value.tickets.lockTicket" />
    </div>
    <NwWorkersTable :workers="nw.overview.value.workers" :now-ms="nowMs" />
    <NwLastEvents :events="nw.overview.value.lastEvents" />
  </template>
</template>

<style scoped lang="scss">
.grid { display: grid; gap: 16px; grid-template-columns: 2fr 1fr; align-items: start; }
@media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
</style>
