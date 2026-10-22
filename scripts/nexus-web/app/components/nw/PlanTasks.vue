<script setup lang="ts">
import { computed } from 'vue'
import type { Plan } from '#nightwatch-schema'

const props = defineProps<{ plan: Plan }>()
// the current task is the first one that is not done; when all are done it is the last
const current = computed(() => props.plan.tasks.find((t) => t.state !== 'done')?.n ?? props.plan.tasksTotal)
const label = (t: Plan['tasks'][number]): string => (t.state === 'fix-round' ? `fix round ${t.round ?? 1}` : t.state === 'done' ? 'done' : 'waiting')
const tone = { done: 'ok', 'fix-round': 'warn', waiting: 'ended' } as const
</script>

<template>
  <NwCard :title="`Task ${current} of ${plan.tasksTotal}`" :note="`${plan.tasksDone} done`">
    <p v-if="plan.tasks.length === 0" class="empty">The plan has no tasks yet.</p>
    <NwTable v-else caption="Plan tasks">
      <template #head><tr><th scope="col">Task</th><th scope="col">Title</th><th scope="col">State</th></tr></template>
      <tr v-for="t in plan.tasks" :key="t.n">
        <td class="mono">{{ t.n }}</td>
        <td>{{ t.title }}</td>
        <td><NwStatus :state="tone[t.state]" :label="label(t)" /></td>
      </tr>
    </NwTable>
  </NwCard>
</template>
