<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { loadAttention } from '../../composables/nightwatch-api'
import { useNightwatchPoll } from '../../composables/useNightwatchPoll'
import { useNow } from '../../utils/use-now'

definePageMeta({ layout: 'nightwatch' })
useHead({ title: 'Attention · Nightwatch' })
const poll = useNightwatchPoll(() => loadAttention())
const nowMs = useNow()
// A polite announcement of the open ids that are new since the last poll (never on the first poll).
// Comparing the SET of ids, not the length, catches a resolve plus an arrival in one poll. The text is cleared for a tick first,
// so a second announcement is read even when the words are the same.
const announce = ref('')
let seen: Set<string> | null = null
watch(() => poll.data.value?.open, async (open) => {
  if (!open) return
  const prev = seen
  seen = new Set(open.map((o) => o.id))
  if (!prev) return
  const fresh = open.filter((o) => !prev.has(o.id))
  if (fresh.length === 0) { announce.value = ''; return }
  const newest = fresh.reduce((a, b) => (Date.parse(b.since) >= Date.parse(a.since) ? b : a))
  announce.value = ''
  await nextTick()
  announce.value = `${fresh.length} new attention ${fresh.length === 1 ? 'item' : 'items'}: ${newest.cause}`
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

