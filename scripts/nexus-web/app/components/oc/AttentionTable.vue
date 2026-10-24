<script setup lang="ts">
import type { Attention } from '#oculus-schema'
import { ageOf, fmtDay } from '../../utils/oc-format'

defineProps<{ open: Attention['open']; resolved: Attention['resolved']; nowMs: number }>()
const TONE = { lost: 'bad', blocked: 'bad', stalled: 'warn' } as const
const tone = (kind: string): 'bad' | 'warn' | 'ok' => (kind in TONE ? TONE[kind as keyof typeof TONE] : 'warn')
</script>

<template>
  <OcCard title="Waiting on Jack" :note="`${open.length} open, oldest first`">
    <p v-if="open.length === 0" class="empty">Nothing waits for you.</p>
    <OcTable v-else caption="Open attention items">
      <template #head><tr><th scope="col">Age</th><th scope="col">Ticket</th><th scope="col">Kind</th><th scope="col">Cause</th><th scope="col">Class</th><th scope="col">Run</th><th scope="col">Resolve with</th></tr></template>
      <tr v-for="a in open" :key="a.id">
        <td data-label="Age" class="mono">{{ ageOf(a.since, nowMs) }}</td>
        <td data-label="Ticket" class="mono">{{ a.ticket ?? '-' }}</td>
        <td data-label="Kind"><OcStatus :state="tone(a.kind)" :label="a.kind" /></td>
        <td data-label="Cause">{{ a.cause }}</td>
        <td data-label="Class"><span v-if="a.causeClass" class="tag">{{ a.causeClass }}</span> <span v-if="a.retryEligible" class="tag">retry</span><span v-if="!a.causeClass && !a.retryEligible" class="muted">-</span></td>
        <td data-label="Run" class="mono"><NuxtLink :to="`/run/?id=${encodeURIComponent(a.run)}`">{{ a.run }}</NuxtLink></td>
        <td data-label="Resolve with" class="mono"><code class="cmd">dg autonomous attention resolve {{ a.id }}</code></td>
      </tr>
    </OcTable>
    <template v-if="resolved.length">
      <h3 class="sub-h">Resolved <small>last {{ resolved.length }}, times UTC+7</small></h3>
      <OcTable caption="Resolved attention items" dense>
        <template #head><tr><th scope="col" class="sr">Time (UTC+7)</th><th scope="col" class="sr">Ticket</th><th scope="col" class="sr">Kind</th><th scope="col" class="sr">Resolution</th></tr></template>
        <tr v-for="r in resolved" :key="r.id">
          <td data-label="Time (UTC+7)" class="mono">{{ fmtDay(r.ts) }}</td>
          <td data-label="Ticket" class="mono">{{ r.ticket ?? '-' }}</td>
          <td data-label="Kind">{{ r.kind }}</td>
          <td data-label="Resolution" class="muted">resolved by {{ r.by }}<template v-if="r.note">: {{ r.note }}</template></td>
        </tr>
      </OcTable>
    </template>
  </OcCard>
</template>

<style lang="scss">
.oc-card .cmd { font: 12px var(--oc-mono); user-select: all; overflow-wrap: anywhere; }
.oc-card .sub-h { margin: 0; padding: 12px 14px; font-size: 13px; border-top: 1px solid var(--oc-border); border-bottom: 1px solid var(--oc-border); display: flex; justify-content: space-between; align-items: baseline; }
.oc-card .sub-h small { font: 11px var(--oc-mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--oc-text-3); font-weight: 400; }
</style>
