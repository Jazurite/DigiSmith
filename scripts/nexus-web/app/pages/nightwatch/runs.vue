<script setup lang="ts">
import { computed } from 'vue'
import { HEALTH, ROLES, TRIGGERS } from '#oculus-schema'
import type { Runs } from '#oculus-schema'
import { loadRuns } from '../../composables/oculus-api'
import { useRestartingPoll } from '../../composables/useRestartingPoll'
import { isSafeId } from '../../utils/oc-format'
import { useNow } from '../../utils/use-now'
import OcRunFilters from '../../components/oc/RunFilters.vue'
import OcRunsTable from '../../components/oc/RunsTable.vue'

definePageMeta({ layout: 'oculus' })
useHead({ title: 'Runs · Nightwatch' })

const route = useRoute()
const one = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? '') : typeof v === 'string' ? v : '')
const pick = (v: unknown, allowed: readonly string[]): string => (allowed.includes(one(v)) ? one(v) : '')
// the filter lives in the URL; a value that is not valid is dropped, so the API never gets it
const filters = computed(() => ({
  state: pick(route.query.state, HEALTH), role: pick(route.query.role, ROLES), trigger: pick(route.query.trigger, TRIGGERS),
  project: isSafeId(one(route.query.project)) ? one(route.query.project) : '',
  ticket: isSafeId(one(route.query.ticket)) ? one(route.query.ticket) : '',
}))
const filtered = computed(() => Object.values(filters.value).some(Boolean))
function setFilters(next: typeof filters.value): void {
  const query = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== ''))
  void navigateTo({ query }, { replace: true })
}

const poll = useRestartingPoll<Runs>(() => JSON.stringify(filters.value), (k) => loadRuns({ ...(JSON.parse(k) as typeof filters.value), limit: 100 }))
// the Project choices: every project in the loaded rows, plus the one in the URL
const projects = computed(() => {
  const seen = new Set<string>((poll.data.value?.runs ?? []).map((r: { project: string | null }) => r.project).filter((p: string | null): p is string => p !== null))
  if (filters.value.project) seen.add(filters.value.project)
  return [...seen].sort()
})
const nowMs = useNow()
</script>

<template>
  <OcPageHead title="Runs" sub="Every run, newest first." />
  <OcRunFilters :model-value="filters" :projects="projects" @update:model-value="setFilters" />
  <OcPanel v-if="!poll.data.value && !poll.error.value" kind="loading" />
  <OcPanel v-else-if="!poll.data.value" kind="error" title="The runs are not available right now." @retry="poll.refresh()" />
  <template v-else>
    <OcStaleBanner v-if="poll.error.value" :failed-at="poll.failedAt.value" />
    <OcPanel v-if="filtered && poll.data.value.runs.length === 0" kind="empty" title="No run matches." />
    <OcRunsTable v-else :runs="poll.data.value.runs" :now-ms="nowMs" />
  </template>
</template>
