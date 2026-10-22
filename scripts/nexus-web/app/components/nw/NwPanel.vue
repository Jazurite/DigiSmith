<script setup lang="ts">
const props = defineProps<{ kind: 'loading' | 'empty' | 'error'; title?: string; text?: string; retrying?: boolean }>()
const emit = defineEmits<{ retry: [] }>()
// aria-disabled, not disabled: the button keeps keyboard focus; a click while retrying does nothing
function onRetry() { if (!props.retrying) emit('retry') }
</script>

<template>
  <div v-if="kind === 'loading'" class="panel" aria-busy="true">
    <span class="bar" /><span class="bar short" /><span class="bar" />
  </div>
  <div v-else class="panel" :role="kind === 'error' ? 'alert' : 'status'">
    <p v-if="title" class="title">{{ title }}</p>
    <p v-if="text" class="text">{{ text }}</p>
    <button v-if="kind === 'error'" type="button" class="retry" :aria-disabled="retrying ? 'true' : undefined" @click="onRetry">{{ retrying ? 'Retrying…' : 'Retry' }}</button>
  </div>
</template>

<style scoped lang="scss">
.panel { padding: 22px 14px; display: grid; gap: 8px; justify-items: start; color: var(--nw-text-2); }
.title { margin: 0; color: var(--nw-text); font-weight: 600; }
.text { margin: 0; }
.retry { min-width: 24px; min-height: 24px; padding: 4px 12px; border: 1px solid var(--nw-strong); border-radius: var(--nw-radius-sm); background: var(--nw-raised); color: var(--nw-text); font: inherit; cursor: pointer; }
.retry:hover { background: var(--nw-hover); }
.retry[aria-disabled='true'] { opacity: 0.6; cursor: default; }
.retry:focus-visible { outline: 2px solid var(--nw-primary); outline-offset: 2px; }
.bar { display: block; width: 100%; height: 12px; border-radius: var(--nw-radius-xs); background: var(--nw-raised); animation: nw-pulse 1.4s ease-in-out infinite; }
.bar.short { width: 60%; }
@keyframes nw-pulse { 50% { opacity: 0.5; } }
@media (prefers-reduced-motion: reduce) { .bar { animation: none; } }
@media (max-width: 760px) { .retry { min-height: 44px; } }
</style>
