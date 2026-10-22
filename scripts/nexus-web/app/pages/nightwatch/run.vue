<script setup lang="ts">
import { computed, effectScope, onScopeDispose, ref, shallowRef, watch } from 'vue'
import type { EffectScope } from 'vue'
import { loadRun, NightwatchApiError } from '../../composables/nightwatch-api'
import { useEventTail } from '../../composables/useEventTail'
import { useRestartingPoll } from '../../composables/useRestartingPoll'
import { isSafeId } from '../../utils/nw-format'
import NwBudgetCard from '../../components/nw/BudgetCard.vue'
import NwEventStream from '../../components/nw/EventStream.vue'
import NwOrderCard from '../../components/nw/OrderCard.vue'
import NwPipelineBar from '../../components/nw/PipelineBar.vue'
import NwRecordCard from '../../components/nw/RecordCard.vue'

definePageMeta({ layout: 'nightwatch' })
useHead({ title: 'Run · Nightwatch' })

const route = useRoute()
// the id comes from the query and can change without a new page (a link to another run): everything restarts on a change
const id = computed(() => { const q = route.query.id; const v = Array.isArray(q) ? q[0] : q; return isSafeId(v) ? v : null })
const notFound = ref(false)
const poll = useRestartingPoll(() => (id.value && !notFound.value ? id.value : null), async (k) => {
  try { return await loadRun(k) } catch (e) {
    // a late answer for a run that is no longer shown must not mark the current run as missing
    if (e instanceof NightwatchApiError && e.status === 404 && k === id.value) notFound.value = true
    throw e
  }
})
const tail = shallowRef<ReturnType<typeof useEventTail> | null>(null)
let tailScope: EffectScope | undefined
watch(id, (v) => {
  tailScope?.stop()
  notFound.value = false
  tail.value = v ? (tailScope = effectScope(true)).run(() => useEventTail(v)) ?? null : null
}, { immediate: true })
onScopeDispose(() => tailScope?.stop())
watch(notFound, (v) => { if (v) { poll.stop(); tailScope?.stop() } })
const run = computed(() => poll.data.value)
const branch = computed(() => (typeof run.value?.record.branch === 'string' ? run.value.record.branch : null))
const meta = computed(() => run.value ? [run.value.row.ticket, run.value.row.role, run.value.row.seat, run.value.row.model, branch.value].filter(Boolean).join(' · ') : '')
</script>

<template>
  <NwPanel v-if="!id || notFound" kind="empty" title="This run does not exist." />
  <template v-else>
    <p class="muted mono crumb"><NuxtLink to="/nightwatch/runs/">Runs</NuxtLink> / {{ id }}</p>
    <h1 class="mono">{{ id }} <NwStatus v-if="run" class="state" :state="run.row.state" /></h1>
    <p v-if="run" class="nw-sub mono">{{ meta }}</p>
    <NwPanel v-if="!run && !poll.error.value" kind="loading" />
    <NwPanel v-else-if="!run" kind="error" title="This run is not available right now." @retry="poll.refresh()" />
    <template v-else>
      <NwStaleBanner v-if="poll.error.value" />
      <NwPipelineBar :steps="run.pipeline" />
      <div class="cols">
        <div>
          <NwStaleBanner v-if="tail && tail.error.value && tail.lines.value.length" />
          <p v-if="tail && tail.earlierError.value" class="nw-sub" role="status">Earlier lines could not be loaded. Try again.</p>
          <NwPanel v-if="tail && tail.error.value && !tail.lines.value.length" kind="error" title="The events are not available right now." @retry="tail.setGroup(tail.group.value)" />
          <NwEventStream
            v-else-if="tail"
            :lines="tail.lines.value" :total="tail.total.value" :group="tail.group.value" :tail="tail.tail.value" :has-earlier="tail.hasEarlier.value"
            @update:group="tail.setGroup($event)" @update:tail="tail.tail.value = $event" @earlier="tail.loadEarlier()"
          />
        </div>
        <div>
          <NwBudgetCard :budget="run.budget" />
          <NwRecordCard :record="run.record" />
          <NwOrderCard :order="run.order" />
        </div>
      </div>
    </template>
  </template>
</template>

<style scoped lang="scss">
.crumb { margin: 0 0 4px; color: var(--nw-text-3); }
.crumb a { color: var(--nw-primary); }
.state { font-size: 12px; }
h1 { overflow-wrap: anywhere; }
.cols { display: grid; gap: 16px; grid-template-columns: 2fr 1fr; align-items: start; }
@media (max-width: 760px) { .cols { grid-template-columns: 1fr; } }
</style>
