<script setup lang="ts">
import { formatShort } from '#days'

export interface TipInfo { age: number; week: number; from: string; to: string; state: 'lived' | 'current' | 'ahead' }
defineProps<{ info: TipInfo | null; mode: 'pointer' | 'readout'; inline?: boolean }>()
const WORD = { lived: 'Lived', current: 'This week', ahead: 'Ahead' } as const
</script>

<template>
  <div v-if="info" id="week-tooltip" class="tip" :class="[mode, { inline }]" :role="mode === 'pointer' ? 'tooltip' : undefined" :aria-hidden="mode === 'readout' ? 'true' : undefined">
    <strong>Age {{ info.age }} · Week {{ info.week }} of 52</strong>
    <span>{{ formatShort(info.from) }} – {{ formatShort(info.to) }}</span>
    <span class="state"><i class="sw" :class="info.state" aria-hidden="true" />{{ WORD[info.state] }}</span>
  </div>
</template>

<style scoped lang="scss">
.tip { display: grid; gap: 2px; padding: 8px 12px; border-radius: 8px; background: var(--ink); color: var(--bg); font-size: 13px; line-height: 1.4; box-shadow: 0 4px 16px rgb(0 0 0 / 0.25); pointer-events: none; z-index: 20; animation: fade 120ms ease-out; }
.pointer { position: fixed; left: 0; top: 0; will-change: transform; }
.readout { position: fixed; left: 16px; right: 16px; bottom: 16px; font-size: 15px; }
.tip.inline { position: static; animation: none; }
.state { display: inline-flex; align-items: center; gap: 8px; }
.sw { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.lived { background: var(--bg); }
.current { background: var(--accent); }
.ahead { box-shadow: inset 0 0 0 1px var(--bg); }
@keyframes fade { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .tip { animation: none; } }
</style>
