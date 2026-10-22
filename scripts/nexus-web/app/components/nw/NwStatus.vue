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
.st { font-family: var(--nw-mono); white-space: nowrap; }
.dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; background: var(--nw-neutral); }
.ok { color: var(--nw-ok); }
.ok .dot { background: var(--nw-ok); }
.info { color: var(--nw-info); }
.info .dot { background: var(--nw-info); }
.warn { color: var(--nw-warn); }
.warn .dot { background: var(--nw-warn); }
.bad { color: var(--nw-bad); }
.bad .dot { background: var(--nw-bad); }
.muted { color: var(--nw-text-3); }
.muted .dot { background: var(--nw-text-3); }
</style>
