<script setup lang="ts">
import { computed, provide } from 'vue'
import { loadLive, loadOverview } from '../composables/oculus-api'
import { useOculusPoll } from '../composables/useOculusPoll'

// The layout owns the one poll; the top bar and the Operations page read the same object through 'ocOverview'.
const poll = useOculusPoll(() => loadOverview())
const attention = computed(() => poll.data.value?.attentionCount ?? 0)
const shared = { overview: poll.data, stale: poll.error, updatedAt: poll.updatedAt, failedAt: poll.failedAt, attention, refresh: poll.refresh }
provide('ocOverview', shared)
// DGS-599: the live herdr agent list, every 5 s; the top bar, the nav badge and the index page read it through 'ocLive'
const livePoll = useOculusPoll(() => loadLive(), { intervalMs: 5_000, backoffMs: 5_000 })
const blocked = computed(() => livePoll.data.value?.agents.filter((a) => a.status === 'blocked').length ?? 0)
provide('ocLive', { live: livePoll.data, stale: livePoll.error, refresh: livePoll.refresh })
</script>

<template>
  <div class="oc">
    <a class="skip" href="#main">Skip to the content</a>
    <OcShell :attention="attention" :blocked="blocked">
      <template #topbar><OcTopBar :overview="shared.overview.value" :stale="shared.stale.value" :updated-at="shared.updatedAt.value" :live="livePoll.data.value" :live-stale="livePoll.error.value" /></template>
      <slot />
    </OcShell>
  </div>
</template>

<style scoped lang="scss">
.skip { position: absolute; left: -999px; top: 0; padding: 8px 12px; background: var(--oc-raised); color: var(--oc-text); z-index: 10; }
.skip:focus { left: 0; outline: 2px solid var(--oc-primary); }
</style>
