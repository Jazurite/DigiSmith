<script setup lang="ts">
import { computed } from 'vue'
import type { LiveAgent } from '#oculus-schema'

const props = defineProps<{ status: LiveAgent['status']; disconnected: boolean }>()
// only working is green; blocked is the bad tone; disconnected turns every dot neutral and hollow (no false green)
const TONE = { working: 'ok', blocked: 'bad', idle: 'info', done: 'muted', unknown: 'neutral' } as const
const tone = computed(() => (props.disconnected ? 'neutral' : TONE[props.status]))
</script>

<template>
  <span class="st" :class="[tone, { hollow: disconnected || status === 'unknown' }]"><i class="dot" aria-hidden="true" />{{ status }}</span>
</template>

<style scoped lang="scss">
.st { font-family: var(--oc-mono); white-space: nowrap; color: var(--oc-text-2); }
.dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; background: var(--oc-neutral); }
.ok { color: var(--oc-ok); } .ok .dot { background: var(--oc-ok); }
.bad { color: var(--oc-bad); } .bad .dot { background: var(--oc-bad); }
.info .dot { background: var(--oc-info); }
.muted { color: var(--oc-text-3); } .muted .dot { background: var(--oc-text-3); }
.hollow .dot { background: transparent; box-shadow: inset 0 0 0 1.5px var(--oc-neutral); }
</style>
