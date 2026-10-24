<script setup lang="ts">
import { computed } from 'vue'
import { AGENT_ROLES, AGENT_STATUSES, type LiveAgent } from '#oculus-schema'
import type { AgentFilter } from '../../utils/agent-filter'

const props = defineProps<{ modelValue: AgentFilter; agents: LiveAgent[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: AgentFilter] }>()
const set = (key: keyof AgentFilter, e: Event): void => {
  emit('update:modelValue', { ...props.modelValue, [key]: (e.target as HTMLSelectElement).value })
}
const distinct = (vals: (string | null)[]): string[] => [...new Set(vals.filter((v): v is string => v !== null && v !== ''))].sort()
const selects = computed(() => [
  { key: 'status', label: 'Status', options: [...AGENT_STATUSES] as string[] },
  { key: 'role', label: 'Role', options: [...AGENT_ROLES] as string[] },
  { key: 'project', label: 'Project', options: distinct(props.agents.map((a) => a.project)) },
  { key: 'workspace', label: 'Workspace', options: distinct(props.agents.map((a) => a.workspace)) },
] as const)
</script>

<template>
  <div class="filters" role="group" aria-label="Filter the agents">
    <label v-for="s in selects" :key="s.key">
      <span>{{ s.label }}</span>
      <select :value="modelValue[s.key]" @change="set(s.key, $event)">
        <option value="">All</option>
        <option v-for="o in s.options" :key="o" :value="o">{{ o }}</option>
      </select>
    </label>
  </div>
</template>

<style scoped lang="scss">
.filters { display: flex; gap: 8px 12px; margin-bottom: 12px; flex-wrap: wrap; }
label { display: inline-flex; align-items: center; gap: 6px; color: var(--oc-text-2); font: 11px/14px var(--oc-mono); letter-spacing: 0.04em; text-transform: uppercase; }
select { background: var(--oc-surface); color: var(--oc-text); border: 1px solid var(--oc-border); border-radius: var(--oc-radius-sm); padding: 5px 8px; font: 12px/16px var(--oc-sans); letter-spacing: normal; text-transform: none; min-height: 24px; }
select:focus-visible { outline: 2px solid var(--oc-primary); outline-offset: 1px; }
@media (max-width: 760px) { select { min-height: 44px; } }
</style>
