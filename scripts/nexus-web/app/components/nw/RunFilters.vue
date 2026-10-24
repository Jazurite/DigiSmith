<script setup lang="ts">
import { HEALTH, ROLES, TRIGGERS } from '#nightwatch-schema'

type Filters = { state: string; role: string; trigger: string; project: string; ticket: string }
const props = defineProps<{ modelValue: Filters; projects: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: Filters] }>()
const set = (key: keyof Filters, e: Event): void => {
  emit('update:modelValue', { ...props.modelValue, [key]: (e.target as HTMLInputElement | HTMLSelectElement).value.trim() })
}
const SELECTS = [
  { key: 'state', label: 'State', options: HEALTH },
  { key: 'role', label: 'Role', options: ROLES },
  { key: 'trigger', label: 'Trigger', options: TRIGGERS },
] as const
</script>

<template>
  <div class="filters" role="group" aria-label="Filter the runs">
    <select v-for="s in SELECTS" :key="s.key" :aria-label="s.label" :value="modelValue[s.key]" @change="set(s.key, $event)">
      <option value="">{{ s.label }}: all</option>
      <option v-for="o in s.options" :key="o" :value="o">{{ o }}</option>
    </select>
    <select aria-label="Project" :value="modelValue.project" @change="set('project', $event)">
      <option value="">Project: all</option>
      <option v-for="p in projects" :key="p" :value="p">{{ p }}</option>
    </select>
    <input type="text" aria-label="Ticket" placeholder="Ticket key" :value="modelValue.ticket" @change="set('ticket', $event)">
  </div>
</template>

<style scoped lang="scss">
.filters { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
select, input { background: var(--nw-surface); color: var(--nw-text); border: 1px solid var(--nw-border); border-radius: var(--nw-radius-sm); padding: 5px 8px; font: inherit; min-height: 24px; }
select:focus-visible, input:focus-visible { outline: 2px solid var(--nw-primary); outline-offset: 1px; }
@media (max-width: 760px) { select, input { min-height: 44px; } }
</style>
