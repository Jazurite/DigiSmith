<script setup lang="ts">
import type { RunDetail } from '#nightwatch-schema'
import { fmtClock } from '../../utils/nw-format'

defineProps<{ steps: RunDetail['pipeline'] }>()
const LABEL = { claimed: 'Claimed', 'worktree-ready': 'Worktree ready', building: 'Building', review: 'Review', merged: 'Merged', pushed: 'Pushed' } as const
const time = (at: string | null): string => (at ? fmtClock(Date.parse(at)) : '-')
</script>

<template>
  <ol class="pipe" aria-label="Run pipeline, times UTC+7">
    <li v-for="s in steps" :key="s.step" :class="s.state">
      <i class="dot" aria-hidden="true" />{{ LABEL[s.step] }}
      <span class="sr"> ({{ s.state }})</span>
      <small>{{ time(s.at) }}</small>
      <b v-if="s.state === 'lost'" class="word">lost</b>
    </li>
  </ol>
</template>

<style scoped lang="scss">
.pipe { list-style: none; margin: 0 0 16px; padding: 0; display: grid; grid-template-columns: repeat(6, 1fr); background: var(--nw-surface); border: 1px solid var(--nw-border); border-radius: var(--nw-radius-md); }
li { padding: 10px 14px; border-right: 1px solid var(--nw-border); min-width: 0; }
li:last-child { border: 0; }
small { display: block; font: 11px var(--nw-mono); color: var(--nw-text-3); margin-top: 2px; }
.dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; background: var(--nw-neutral); }
.done .dot { background: var(--nw-ok); }
.current .dot { background: var(--nw-info); }
.lost .dot { background: var(--nw-bad); }
.lost, .word { color: var(--nw-bad); }
.word { font: 600 11px var(--nw-mono); }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 760px) { .pipe { grid-template-columns: repeat(2, 1fr); } }
</style>
