<script setup lang="ts">
import { ref, watch } from 'vue'
import { loadAttention } from '../../composables/nightwatch-api'
import { useNightwatchPoll } from '../../composables/useNightwatchPoll'
import { useNow } from '../../utils/use-now'

definePageMeta({ layout: 'nightwatch' })
useHead({ title: 'Attention · Nightwatch' })
const poll = useNightwatchPoll(() => loadAttention())
const nowMs = useNow()
// a polite announcement when a poll brings more open items than the last one (never on the first load)
const announce = ref('')
watch(() => poll.data.value?.open.length, (n, old) => {
  announce.value = n !== undefined && old !== undefined && n > old ? `${n - old} new attention ${n - old === 1 ? 'item' : 'items'}` : ''
})
</script>

<template>
  <NwPageHead title="Attention" sub="Waiting on Jack. Read-only: no buttons yet." />
  <div class="sr-only" aria-live="polite" aria-atomic="true">{{ announce }}</div>
  <NwPanel v-if="!poll.data.value && !poll.error.value" kind="loading" />
  <NwPanel v-else-if="!poll.data.value" kind="error" title="The attention list is not available right now." @retry="poll.refresh()" />
  <template v-else>
    <NwStaleBanner v-if="poll.error.value" />
    <NwAttentionTable :open="poll.data.value.open" :resolved="poll.data.value.resolved" :now-ms="nowMs" />
  </template>
</template>

