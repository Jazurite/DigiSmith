<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { Live, Overview } from '#oculus-schema'
import { loadAttention } from '../../composables/oculus-api'
import { useOculusPoll } from '../../composables/useOculusPoll'
import { agentChanges } from '../../utils/agent-changes'
import { filterAgents, type AgentFilter } from '../../utils/agent-filter'
import { useNow } from '../../utils/use-now'

definePageMeta({ layout: 'oculus' })
useHead({ title: 'DigiSmith Oculus' })
// the layout owns the one overview poll; this page only reads it
const oc = inject<{ overview: Ref<Overview | null>; stale: Ref<boolean>; updatedAt: Ref<number | null>; failedAt: Ref<number | null>; attention: ComputedRef<number>; refresh: () => Promise<void> }>('ocOverview')!
const nowMs = useNow()

// DGS-599: the live agents (the layout owns the 5 s poll) and the attention summary
const lv = inject<{ live: Ref<Live | null>; stale: Ref<boolean>; refresh: () => Promise<void> }>('ocLive')!
const attention = useOculusPoll(() => loadAttention())
const route = useRoute()
const one = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? '') : typeof v === 'string' ? v : '')
const filter = computed<AgentFilter>(() => ({ status: one(route.query.status), role: one(route.query.role), project: one(route.query.project), workspace: one(route.query.workspace) }))
function setFilter(next: AgentFilter): void { void navigateTo({ query: Object.fromEntries(Object.entries(next).filter(([, v]) => v !== '')), hash: '#agents' }, { replace: true }) }
const shown = computed(() => (lv.live.value ? filterAgents(lv.live.value.agents, filter.value) : []))
const disconnected = computed(() => lv.live.value?.herdr.state === 'disconnected')
// one persistent polite region; the text is cleared for a tick first so the same words are read again
const announce = ref('')
let prev: Live | null = null
watch(() => lv.live.value, async (next) => {
  if (!next) return
  const text = agentChanges(prev, next); prev = next
  if (!text) return
  announce.value = ''; await nextTick(); announce.value = text
})
</script>

<template>
  <OcPageHead title="Oculus" sub="Every herdr agent, what waits on Jack, and the latest work." />
  <div class="sr-only" aria-live="polite" aria-atomic="true" data-testid="agents-live">{{ announce }}</div>
  <section id="agents" aria-labelledby="agents-h" class="agents">
    <h2 id="agents-h">Agents</h2>
    <OcPanel v-if="!lv.live.value && !lv.stale.value" kind="loading" />
    <OcPanel v-else-if="!lv.live.value" kind="error" title="The agent list is not available right now." @retry="lv.refresh()" />
    <template v-else>
      <OcDisconnectedBanner v-if="disconnected" :as-of="lv.live.value.herdr.asOf" />
      <OcAgentFilters :model-value="filter" :agents="lv.live.value.agents" @update:model-value="setFilter" />
      <p v-if="lv.live.value.agents.length === 0 && !disconnected" class="empty">No herdr agents are running.</p>
      <p v-else-if="shown.length === 0 && lv.live.value.agents.length > 0" class="empty">No agent matches.</p>
      <OcAgentsTable v-else-if="shown.length > 0" :agents="shown" :disconnected="disconnected" />
    </template>
  </section>
  <OcAttentionSummary v-if="attention.data.value" :open="attention.data.value.open" />
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
.agents { margin-bottom: 16px; }
.agents h2 { font-size: 13px; margin: 0 0 10px; }
.agents .empty { color: var(--oc-text-2); margin: 0; padding: 12px 0; }
.grid { display: grid; gap: 16px; grid-template-columns: 2fr 1fr; align-items: start; }
@media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
</style>
