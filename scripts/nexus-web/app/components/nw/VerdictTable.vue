<script setup lang="ts">
import type { Plan } from '#nightwatch-schema'

defineProps<{ verdicts: Plan['verdicts']; ledgerError: boolean }>()
const tone = { fixed: 'ok', fixing: 'running', parked: 'warn', rejected: 'bad' } as const
</script>

<template>
  <NwCard title="Reviewer verdicts">
    <p v-if="ledgerError" class="empty bad" role="status">ledger unreadable</p>
    <p v-else-if="verdicts.length === 0" class="empty">No verdicts yet.</p>
    <NwTable v-else caption="Reviewer verdicts">
      <template #head><tr><th scope="col">Scope</th><th scope="col">Round</th><th scope="col">Finding</th><th scope="col">Verdict</th><th scope="col">Reason</th></tr></template>
      <tr v-for="v in verdicts" :key="`${v.scope}-${v.id}-${v.round}`">
        <td>{{ v.scope }}</td>
        <td class="mono">r{{ v.round }}</td>
        <td><span class="mono">{{ v.id }}</span> {{ v.finding }}</td>
        <td><NwStatus :state="tone[v.verdict]" :label="v.verdict" /></td>
        <td class="muted">{{ v.reason }}</td>
      </tr>
    </NwTable>
  </NwCard>
</template>

<style scoped lang="scss">
.bad { color: var(--nw-bad); }
</style>
