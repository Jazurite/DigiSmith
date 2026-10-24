<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ state: 'healthy' | 'blocked' | 'stalled' | 'lost' | 'ended' | 'running' | 'ok' | 'warn' | 'bad'; label?: string }>()
const TONE = { healthy: 'ok', ok: 'ok', running: 'info', stalled: 'warn', warn: 'warn', blocked: 'bad', lost: 'bad', bad: 'bad', ended: 'muted' } as const
const tone = computed(() => TONE[props.state])
</script>

<template>
  <span class="st" :class="tone"><i class="dot" aria-hidden="true" />{{ label ?? state }}</span>
</template>

<style scoped lang="scss">
.st { font-family: var(--oc-mono); white-space: nowrap; }
.dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; background: var(--oc-neutral); }
.ok { color: var(--oc-ok); }
.ok .dot { background: var(--oc-ok); }
.info { color: var(--oc-info); }
.info .dot { background: var(--oc-info); }
.warn { color: var(--oc-warn); }
.warn .dot { background: var(--oc-warn); }
.bad { color: var(--oc-bad); }
.bad .dot { background: var(--oc-bad); }
.muted { color: var(--oc-text-3); }
.muted .dot { background: var(--oc-text-3); }
</style>
