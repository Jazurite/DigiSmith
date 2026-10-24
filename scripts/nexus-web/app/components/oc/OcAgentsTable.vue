<script setup lang="ts">
import type { LiveAgent } from '#oculus-schema'
import OcAgentStatus from './OcAgentStatus.vue'

defineProps<{ agents: LiveAgent[]; disconnected: boolean }>()
const where = (a: LiveAgent): string => [a.workspace, a.tab?.split(':')[1]].filter(Boolean).join(' · ') || '-'
</script>

<template>
  <OcTable caption="herdr agents">
    <template #head>
      <tr><th scope="col">Agent</th><th scope="col">Role</th><th scope="col">Project</th><th scope="col">Status</th><th scope="col">Where</th><th scope="col">Run</th></tr>
    </template>
    <tr v-for="a in agents" :key="a.pane">
      <td data-label="Agent" class="mono"><template v-if="a.name">{{ a.name }}</template><template v-else><span class="muted">unnamed</span> {{ a.pane }}</template></td>
      <td data-label="Role">{{ a.role }}</td>
      <td data-label="Project">{{ a.project ?? '-' }}</td>
      <td data-label="Status"><OcAgentStatus :status="a.status" :disconnected="disconnected" /></td>
      <td data-label="Where" class="mono">{{ where(a) }}</td>
      <td data-label="Run" class="mono"><NuxtLink v-if="a.run" :to="`/run/?id=${encodeURIComponent(a.run)}`">{{ a.run }}</NuxtLink><template v-else>-</template></td>
    </tr>
  </OcTable>
</template>
