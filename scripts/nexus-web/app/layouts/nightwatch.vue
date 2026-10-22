<script setup lang="ts">
import { computed, provide } from 'vue'
import { loadOverview } from '../composables/nightwatch-api'
import { useNightwatchPoll } from '../composables/useNightwatchPoll'

// The layout owns the one poll; the top bar and the Operations page read the same object through 'nwOverview'.
const poll = useNightwatchPoll(() => loadOverview())
const attention = computed(() => poll.data.value?.attentionCount ?? 0)
const shared = { overview: poll.data, stale: poll.error, updatedAt: poll.updatedAt, attention, refresh: poll.refresh }
provide('nwOverview', shared)
</script>

<template>
  <div class="nw">
    <a class="skip" href="#main">Skip to the content</a>
    <NwShell :attention="attention">
      <template #topbar><NwTopBar :overview="shared.overview.value" :stale="shared.stale.value" :updated-at="shared.updatedAt.value" /></template>
      <slot />
    </NwShell>
  </div>
</template>

<style scoped lang="scss">
.skip { position: absolute; left: -999px; top: 0; padding: 8px 12px; background: var(--nw-raised); color: var(--nw-text); z-index: 10; }
.skip:focus { left: 0; outline: 2px solid var(--nw-primary); }
</style>
