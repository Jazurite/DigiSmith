<script setup lang="ts">
import { computed, effectScope, onMounted, onScopeDispose, ref, shallowRef, watch } from 'vue'
import type { EffectScope } from 'vue'
import { loadRun, OculusApiError } from '../../composables/oculus-api'
import { useEventTail } from '../../composables/useEventTail'
import { useRestartingPoll } from '../../composables/useRestartingPoll'
import { isRunning, isSafeId } from '../../utils/oc-format'
import { useNow } from '../../utils/use-now'
import OcBudgetCard from '../../components/oc/BudgetCard.vue'
import OcEventStream from '../../components/oc/EventStream.vue'
import OcOrderCard from '../../components/oc/OrderCard.vue'
import OcPipelineBar from '../../components/oc/PipelineBar.vue'
import OcRecordCard from '../../components/oc/RecordCard.vue'
import OcTokensCard from '../../components/oc/TokensCard.vue'

definePageMeta({ layout: 'oculus' })
useHead({ title: 'Run · DigiSmith Oculus' })

const route = useRoute()
// the id comes from the query and can change without a new page (a link to another run): everything restarts on a change
const id = computed(() => { const q = route.query.id; const v = Array.isArray(q) ? q[0] : q; return isSafeId(v) ? v : null })
const notFound = ref(false)
// the generated page has no query: until the client has mounted, the id is unknown, so never say "does not exist" yet
const mounted = ref(false)
onMounted(() => { mounted.value = true })
const poll = useRestartingPoll(() => (id.value && !notFound.value ? id.value : null), async (k) => {
  try { return await loadRun(k) } catch (e) {
    // a late answer for a run that is no longer shown must not mark the current run as missing
    if (e instanceof OculusApiError && e.status === 404 && k === id.value) notFound.value = true
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
useNow({ fast: () => (run.value ? isRunning(run.value.row) : false) })
const branch = computed(() => (typeof run.value?.record.branch === 'string' ? run.value.record.branch : null))
const meta = computed(() => run.value ? [run.value.row.ticket, run.value.row.role, run.value.row.seat, run.value.row.model, branch.value].filter(Boolean).join(' · ') : '')
</script>

<template>
  <template v-if="!mounted">
    <h1>Run</h1>
    <OcPanel kind="loading" />
  </template>
  <template v-else-if="!id || notFound">
    <h1>Run</h1>
    <OcPanel kind="empty" title="This run does not exist." />
  </template>
  <template v-else>
    <p class="muted mono crumb"><NuxtLink to="/runs/">Runs</NuxtLink> / {{ id }}</p>
    <h1 class="mono">{{ id }} <OcStatus v-if="run" class="state" :state="run.row.state" /></h1>
    <p v-if="run" class="oc-sub mono">{{ meta }}</p>
    <OcPanel v-if="!run && !poll.error.value" kind="loading" />
    <OcPanel v-else-if="!run" kind="error" title="This run is not available right now." @retry="poll.refresh()" />
    <template v-else>
      <OcStaleBanner v-if="poll.error.value" :failed-at="poll.failedAt.value" />
      <OcPipelineBar :steps="run.pipeline" />
      <div class="cols">
        <div>
          <OcStaleBanner v-if="tail && tail.error.value && tail.lines.value.length" :failed-at="tail.failedAt.value" />
          <p v-if="tail && tail.earlierError.value" class="oc-sub" role="status">Earlier lines could not be loaded. Try again.</p>
          <OcPanel v-if="tail && tail.error.value && !tail.lines.value.length" kind="error" title="The events are not available right now." @retry="tail.setGroup(tail.group.value)" />
          <OcEventStream
            v-else-if="tail"
            :lines="tail.lines.value" :total="tail.total.value" :group="tail.group.value" :tail="tail.tail.value" :has-earlier="tail.hasEarlier.value"
            @update:group="tail.setGroup($event)" @update:tail="tail.tail.value = $event" @earlier="tail.loadEarlier()"
          />
        </div>
        <div>
          <OcBudgetCard :budget="run.budget" :phase-since="run.row.phaseSince" />
          <OcRecordCard :record="run.record" />
          <OcOrderCard :order="run.order" />
        </div>
      </div>
      <OcTokensCard :tokens="run.tokens" :as-of="run.tokensAsOf" />
    </template>
  </template>
</template>

<style scoped lang="scss">
.crumb { margin: 0 0 4px; color: var(--oc-text-3); }
.crumb a { color: var(--oc-primary); }
.state { font-size: 12px; }
h1 { overflow-wrap: anywhere; }
.cols { display: grid; gap: 16px; grid-template-columns: 2fr 1fr; align-items: start; }
@media (max-width: 760px) { .cols { grid-template-columns: 1fr; } }
</style>
