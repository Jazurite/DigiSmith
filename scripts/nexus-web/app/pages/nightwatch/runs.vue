<script setup lang="ts">
import { computed } from 'vue'
import { HEALTH, ROLES, TRIGGERS } from '#nightwatch-schema'
import type { Runs } from '#nightwatch-schema'
import { loadRuns } from '../../composables/nightwatch-api'
import { useRestartingPoll } from '../../composables/useRestartingPoll'
import { isSafeId } from '../../utils/nw-format'
import { useNow } from '../../utils/use-now'
import NwRunFilters from '../../components/nw/RunFilters.vue'
import NwRunsTable from '../../components/nw/RunsTable.vue'

definePageMeta({ layout: 'nightwatch' })
useHead({ title: 'Runs · Nightwatch' })

const route = useRoute()
const one = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? '') : typeof v === 'string' ? v : '')
const pick = (v: unknown, allowed: readonly string[]): string => (allowed.includes(one(v)) ? one(v) : '')
// the filter lives in the URL; a value that is not valid is dropped, so the API never gets it
const filters = computed(() => ({
  state: pick(route.query.state, HEALTH), role: pick(route.query.role, ROLES), trigger: pick(route.query.trigger, TRIGGERS),
  ticket: isSafeId(one(route.query.ticket)) ? one(route.query.ticket) : '',
}))
const filtered = computed(() => Object.values(filters.value).some(Boolean))
function setFilters(next: typeof filters.value): void {
  const query = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== ''))
  void navigateTo({ query }, { replace: true })
}

const poll = useRestartingPoll<Runs>(() => JSON.stringify(filters.value), (k) => loadRuns({ ...(JSON.parse(k) as typeof filters.value), limit: 100 }))
const nowMs = useNow()
</script>

<template>
  <NwPageHead title="Runs" sub="Every run, newest first." />
  <NwRunFilters :model-value="filters" @update:model-value="setFilters" />
  <NwPanel v-if="!poll.data.value && !poll.error.value" kind="loading" />
  <NwPanel v-else-if="!poll.data.value" kind="error" title="The runs are not available right now." @retry="poll.refresh()" />
  <template v-else>
    <NwStaleBanner v-if="poll.error.value" :failed-at="poll.failedAt.value" />
    <NwPanel v-if="filtered && poll.data.value.runs.length === 0" kind="empty" title="No run matches." />
    <NwRunsTable v-else :runs="poll.data.value.runs" :now-ms="nowMs" />
  </template>
</template>
