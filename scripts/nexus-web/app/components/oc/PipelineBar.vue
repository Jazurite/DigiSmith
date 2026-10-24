<script setup lang="ts">
import type { RunDetail } from '#oculus-schema'
import { fmtUtc7 } from '../../utils/oc-format'

defineProps<{ steps: RunDetail['pipeline'] }>()
const LABEL = { claimed: 'Claimed', 'worktree-ready': 'Worktree ready', building: 'Building', review: 'Review', merged: 'Merged', pushed: 'Pushed' } as const
</script>

<template>
  <ol class="pipe" aria-label="Run pipeline, times UTC+7">
    <li v-for="s in steps" :key="s.step" :class="s.state">
      <i class="dot" aria-hidden="true" />{{ LABEL[s.step] }}
      <span class="sr"> ({{ s.state }})</span>
      <small>{{ fmtUtc7(s.at) }}</small>
      <b v-if="s.state === 'lost'" class="word">lost</b>
    </li>
  </ol>
</template>

<style scoped lang="scss">
.pipe { list-style: none; margin: 0 0 16px; padding: 0; display: grid; grid-template-columns: repeat(6, 1fr); background: var(--oc-surface); border: 1px solid var(--oc-border); border-radius: var(--oc-radius-md); }
li { padding: 10px 14px; border-right: 1px solid var(--oc-border); min-width: 0; }
li:last-child { border: 0; }
small { display: block; font: 11px var(--oc-mono); color: var(--oc-text-3); margin-top: 2px; }
.dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; background: var(--oc-neutral); }
.done .dot { background: var(--oc-ok); }
.current .dot { background: var(--oc-info); }
.lost .dot { background: var(--oc-bad); }
.lost, .word { color: var(--oc-bad); }
.word { font: 600 11px var(--oc-mono); }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 760px) { .pipe { grid-template-columns: repeat(2, 1fr); } }
</style>
