<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { Overview, Plan } from '#oculus-schema'
import { loadPlan, loadRuns } from '../../composables/oculus-api'
import { useRestartingPoll } from '../../composables/useRestartingPoll'
import { isSafeId } from '../../utils/oc-format'
import OcPlanTasks from '../../components/oc/PlanTasks.vue'
import OcVerdictTable from '../../components/oc/VerdictTable.vue'

definePageMeta({ layout: 'oculus' })
useHead({ title: 'Plan · DigiSmith Oculus' })

// the layout owns the overview poll; the page only reads it to find the ticket under lock, else the first worker
const oc = inject<{ overview: Ref<Overview | null>; stale: Ref<boolean>; updatedAt: Ref<number | null>; failedAt: Ref<number | null>; attention: ComputedRef<number>; refresh: () => Promise<void> }>('ocOverview')!
const route = useRoute()
const fromQuery = computed(() => { const q = route.query.ticket; const v = Array.isArray(q) ? q[0] : q; return isSafeId(v) ? v : null })
const ticket = computed(() => fromQuery.value ?? (isSafeId(oc.overview.value?.tickets.lockTicket) ? oc.overview.value!.tickets.lockTicket : null) ?? oc.overview.value?.workers.find((w) => isSafeId(w.ticket))?.ticket ?? null)
// the overview either arrived or failed; before that the page does not know yet whether a worker exists
const settled = computed(() => oc.overview.value !== null || oc.stale.value)

const poll = useRestartingPoll<Plan>(() => ticket.value, (k) => loadPlan(k))

// the picker: unique tickets of the latest runs, loaded once and only when no ticket is known
const choices = ref<string[] | null>(null)
const pickerFailed = ref(false)
const pickerTry = ref(0)
watch([() => ticket.value === null && settled.value, () => import.meta.client, pickerTry], async ([need, client]) => {
  if (!need || !client || choices.value) return
  try { choices.value = [...new Set((await loadRuns({ limit: 100 })).runs.map((r) => r.ticket).filter(isSafeId))] } catch { pickerFailed.value = true }
}, { immediate: true })
const retryPicker = (): void => { pickerFailed.value = false; choices.value = null; pickerTry.value++ }
const pick = (e: Event): void => { const v = (e.target as HTMLSelectElement).value; if (isSafeId(v)) void navigateTo({ query: { ticket: v } }) }
</script>

<template>
  <OcPageHead title="Plan" :sub="ticket ? `${ticket} · plan tasks and reviewer verdicts` : 'Plan tasks and reviewer verdicts.'" />
  <template v-if="ticket">
    <OcPanel v-if="!poll.data.value && !poll.error.value" kind="loading" />
    <OcPanel v-else-if="!poll.data.value" kind="error" title="The plan is not available right now." @retry="poll.refresh()" />
    <template v-else>
      <OcStaleBanner v-if="poll.error.value" :failed-at="poll.failedAt.value" />
      <OcPanel v-if="!poll.data.value.found" kind="empty" title="No plan yet for this ticket." />
      <div v-else class="grid">
        <OcPlanTasks :plan="poll.data.value" />
        <OcVerdictTable :verdicts="poll.data.value.verdicts" :ledger-error="poll.data.value.ledgerError" />
      </div>
    </template>
  </template>
  <OcPanel v-else-if="!settled" kind="loading" />
  <template v-else>
    <label class="pick">Ticket
      <select aria-label="Ticket" :disabled="!choices?.length" @change="pick">
        <option value="">{{ choices?.length ? 'Choose a ticket' : 'No ticket yet' }}</option>
        <option v-for="t in choices ?? []" :key="t" :value="t">{{ t }}</option>
      </select>
    </label>
    <OcPanel v-if="pickerFailed" kind="error" title="The tickets are not available right now." @retry="retryPicker" />
    <OcPanel v-else kind="empty" title="Pick a ticket." />
  </template>
</template>

<style scoped lang="scss">
.grid { display: grid; gap: 16px; grid-template-columns: 1fr 1fr; align-items: start; }
@media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
.pick { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; color: var(--oc-text-2); }
.pick select { background: var(--oc-surface); color: var(--oc-text); border: 1px solid var(--oc-border); border-radius: var(--oc-radius-sm); padding: 5px 8px; font: inherit; min-height: 24px; }
.pick select:focus-visible { outline: 2px solid var(--oc-primary); outline-offset: 1px; }
@media (max-width: 760px) { .pick select { min-height: 44px; } }
</style>
