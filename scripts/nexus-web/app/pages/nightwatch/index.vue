<script setup lang="ts">
import { inject } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { Overview } from '#nightwatch-schema'
import { useNow } from '../../utils/use-now'

definePageMeta({ layout: 'nightwatch' })
useHead({ title: 'Operations · Nightwatch' })
// the layout owns the one overview poll; this page only reads it
const nw = inject<{ overview: Ref<Overview | null>; stale: Ref<boolean>; updatedAt: Ref<number | null>; attention: ComputedRef<number>; refresh: () => Promise<void> }>('nwOverview')!
const nowMs = useNow()
</script>

<template>
  <h1>Operations</h1>
  <p class="sub">Tickets per phase, active workers and the latest events.</p>
  <NwPanel v-if="!nw.overview.value && !nw.stale.value" kind="loading" />
  <NwPanel v-else-if="!nw.overview.value" kind="error" title="The operations view is not available right now." @retry="nw.refresh()" />
  <template v-else>
    <p v-if="nw.stale.value" class="banner" role="status">The last update failed. Showing the last good data, it may be old.</p>
    <div class="grid">
      <PhaseTable :rows="nw.overview.value.tickets.rows" :lock-ticket="nw.overview.value.tickets.lockTicket" :window-days="nw.overview.value.tickets.windowDays" :now-ms="nowMs" />
      <ScanCard :scan="nw.overview.value.scan" :lock-ticket="nw.overview.value.tickets.lockTicket" />
    </div>
    <WorkersTable :workers="nw.overview.value.workers" :now-ms="nowMs" />
    <LastEvents :events="nw.overview.value.lastEvents" />
  </template>
</template>

<style scoped lang="scss">
.sub { color: var(--nw-text-2); margin: 0 0 18px; }
.banner { background: var(--nw-raised); border: 1px solid var(--nw-border); border-left: 3px solid var(--nw-warn); padding: 8px 12px; margin: 0 0 16px; color: var(--nw-text-2); }
.grid { display: grid; gap: 16px; grid-template-columns: 2fr 1fr; align-items: start; }
@media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
</style>
