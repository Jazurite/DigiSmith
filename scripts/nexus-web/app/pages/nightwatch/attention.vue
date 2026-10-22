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
  <NwPageHead title="Attention" sub="Waiting on Jack. Read-only: no buttons yet." />
  <NwPanel v-if="!poll.data.value && !poll.error.value" kind="loading" />
  <NwPanel v-else-if="!poll.data.value" kind="error" title="The attention list is not available right now." @retry="poll.refresh()" />
  <template v-else>
    <NwStaleBanner v-if="poll.error.value" />
    <AttentionTable :open="poll.data.value.open" :resolved="poll.data.value.resolved" :now-ms="nowMs" />
  </template>
</template>

