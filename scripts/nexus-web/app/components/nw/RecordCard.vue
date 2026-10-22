<script setup lang="ts">
import { computed } from 'vue'
import { fmtDay } from '../../utils/nw-format'

const props = defineProps<{ record: Record<string, unknown> }>()
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/
const show = (v: unknown): string => {
  if (typeof v === 'string') return ISO.test(v) ? `${fmtDay(v)} (UTC+7)` : v
  if (v === null || typeof v === 'number' || typeof v === 'boolean') return String(v)
  return JSON.stringify(v)
}
const entries = computed(() => Object.entries(props.record))
const raw = computed(() => JSON.stringify(props.record, null, 2))
</script>

<template>
  <NwCard title="Run record" note="run.json">
    <p v-if="entries.length === 0" class="empty">No record.</p>
    <dl v-else class="kv">
      <template v-for="[k, v] in entries" :key="k"><dt>{{ k }}</dt><dd>{{ show(v) }}</dd></template>
    </dl>
    <details v-if="entries.length" class="raw"><summary>Raw JSON</summary><pre>{{ raw }}</pre></details>
  </NwCard>
</template>

<style scoped lang="scss">
.raw { padding: 8px 14px; border-top: 1px solid var(--nw-border); font-size: 11px; }
summary { cursor: pointer; color: var(--nw-text-2); min-height: 24px; }
summary:focus-visible { outline: 2px solid var(--nw-primary); outline-offset: 2px; }
pre { margin: 8px 0 0; font: 11px var(--nw-mono); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 240px; overflow: auto; }
</style>
