<script setup lang="ts">
import { inject } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { Overview } from '#oculus-schema'
import { useNow } from '../../utils/use-now'

definePageMeta({ layout: 'oculus' })
useHead({ title: 'DigiSmith Oculus' })
// the layout owns the one overview poll; this page only reads it
const oc = inject<{ overview: Ref<Overview | null>; stale: Ref<boolean>; updatedAt: Ref<number | null>; failedAt: Ref<number | null>; attention: ComputedRef<number>; refresh: () => Promise<void> }>('ocOverview')!
const nowMs = useNow()
</script>

<template>
  <OcPageHead title="Oculus" sub="Every herdr agent, what waits on Jack, and the latest work." />
  <OcPanel v-if="!oc.overview.value && !oc.stale.value" kind="loading" />
  <OcPanel v-else-if="!oc.overview.value" kind="error" title="The operations view is not available right now." @retry="oc.refresh()" />
  <template v-else>
    <OcStaleBanner v-if="oc.stale.value" :failed-at="oc.failedAt.value" />
    <div class="grid">
      <OcPhaseTable :rows="oc.overview.value.tickets.rows" :lock-ticket="oc.overview.value.tickets.lockTicket" :window-days="oc.overview.value.tickets.windowDays" :now-ms="nowMs" />
      <OcScanCard :scan="oc.overview.value.scan" :lock-ticket="oc.overview.value.tickets.lockTicket" />
    </div>
    <OcWorkersTable :workers="oc.overview.value.workers" :now-ms="nowMs" />
    <OcLastEvents :events="oc.overview.value.lastEvents" />
  </template>
</template>

<style scoped lang="scss">
.grid { display: grid; gap: 16px; grid-template-columns: 2fr 1fr; align-items: start; }
@media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
</style>
