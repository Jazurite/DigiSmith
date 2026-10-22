<script setup lang="ts">
import { loadAttention } from '../../composables/nightwatch-api'
import { useNightwatchPoll } from '../../composables/useNightwatchPoll'
import { useNow } from '../../utils/use-now'

definePageMeta({ layout: 'nightwatch' })
useHead({ title: 'Attention · Nightwatch' })
const poll = useNightwatchPoll(() => loadAttention())
const nowMs = useNow()
</script>

<template>
  <h1>Attention</h1>
  <p class="sub">Waiting on Jack. Read-only: no buttons yet.</p>
  <NwPanel v-if="!poll.data.value && !poll.error.value" kind="loading" />
  <NwPanel v-else-if="!poll.data.value" kind="error" title="The attention list is not available right now." @retry="poll.refresh()" />
  <template v-else>
    <p v-if="poll.error.value" class="banner" role="status">The last update failed. Showing the last good data, it may be old.</p>
    <AttentionTable :open="poll.data.value.open" :resolved="poll.data.value.resolved" :now-ms="nowMs" />
  </template>
</template>

<style scoped lang="scss">
.sub { color: var(--nw-text-2); margin: 0 0 18px; }
.banner { background: var(--nw-raised); border: 1px solid var(--nw-border); border-left: 3px solid var(--nw-warn); padding: 8px 12px; margin: 0 0 16px; color: var(--nw-text-2); }
</style>
