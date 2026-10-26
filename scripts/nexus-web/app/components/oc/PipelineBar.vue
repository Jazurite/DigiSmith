<script setup lang="ts">
import type { RunDetail } from '#oculus-schema'
import { fmtMinutes, fmtUtc7, spokenMinutes, stepTime } from '../../utils/oc-format'

type Step = RunDetail['pipeline'][number]
defineProps<{ steps: RunDetail['pipeline']; nowMs?: number }>()
const LABEL = { claimed: 'Claimed', 'worktree-ready': 'Worktree ready', building: 'Building', review: 'Review', merged: 'Merged', pushed: 'Pushed' } as const
// Pushed is the end mark: blank once reached, a dash before
const durText = (s: Step, t: ReturnType<typeof stepTime>): string => {
  if (t) return fmtMinutes(t.min)
  return s.step === 'pushed' && s.state === 'done' ? '' : '-'
}
const srText = (s: Step, t: ReturnType<typeof stepTime>): string => {
  if (!t) return `(${s.state})`
  return t.live ? `(${s.state}, ${spokenMinutes(t.min)} so far)` : `(${s.state}, ${spokenMinutes(t.min)})`
}
</script>

<template>
  <ol class="pipe" aria-label="Run pipeline, times UTC+7">
    <li v-for="s in steps" :key="s.step" :class="s.state">
      <i class="dot" aria-hidden="true" />{{ LABEL[s.step] }}
      <!-- only the current step reads the clock; the others are fixed by their own data -->
      <OcTick v-if="s.state === 'current'" v-slot="{ nowMs: n }" :now-ms="nowMs">
        <template v-for="t in [stepTime(s, n)]" :key="0">
          <span class="sr"> {{ srText(s, t) }}</span>
          <small>{{ fmtUtc7(s.at) }}</small>
          <small class="dur" :class="{ live: !!t?.live }" aria-hidden="true">{{ durText(s, t) }}</small>
        </template>
      </OcTick>
      <template v-else>
        <template v-for="t in [stepTime(s, 0)]" :key="0">
          <span class="sr"> {{ srText(s, t) }}</span>
          <small>{{ fmtUtc7(s.at) }}</small>
          <small class="dur" :class="{ live: !!t?.live }" aria-hidden="true">{{ durText(s, t) }}</small>
        </template>
      </template>
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
.dur { min-height: 1.4em; }
.dur.live { color: var(--oc-info); font-weight: 600; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 760px) { .pipe { grid-template-columns: repeat(2, 1fr); } }
</style>
