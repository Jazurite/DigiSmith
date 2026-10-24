<script setup lang="ts">
import type { Plan } from '#oculus-schema'

defineProps<{ verdicts: Plan['verdicts']; ledgerError: boolean }>()
const tone = { fixed: 'ok', fixing: 'running', parked: 'warn', rejected: 'bad' } as const
</script>

<template>
  <OcCard title="Reviewer verdicts">
    <p v-if="ledgerError" class="empty bad" role="status">ledger unreadable</p>
    <p v-else-if="verdicts.length === 0" class="empty">No verdicts yet.</p>
    <OcTable v-else caption="Reviewer verdicts">
      <template #head><tr><th scope="col">Scope</th><th scope="col">Round</th><th scope="col">Finding</th><th scope="col">Verdict</th><th scope="col">Reason</th></tr></template>
      <tr v-for="v in verdicts" :key="`${v.scope}-${v.id}-${v.round}`">
        <td data-label="Scope">{{ v.scope }}</td>
        <td data-label="Round" class="mono">r{{ v.round }}</td>
        <td data-label="Finding"><span class="mono">{{ v.id }}</span> {{ v.finding }}</td>
        <td data-label="Verdict"><OcStatus :state="tone[v.verdict]" :label="v.verdict" /></td>
        <td data-label="Reason" class="muted">{{ v.reason }}</td>
      </tr>
    </OcTable>
  </OcCard>
</template>

<style scoped lang="scss">
.bad { color: var(--oc-bad); }
</style>
