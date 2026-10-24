<script setup lang="ts">
import type { EventRow } from '#nightwatch-schema'
import { nextTick, onMounted, ref, watch } from 'vue'
import { fmtClock } from '../../utils/nw-format'

type Group = 'all' | 'agent' | 'system' | 'errors'
const props = defineProps<{ lines: EventRow[]; total: number; group: Group; tail: boolean; hasEarlier: boolean }>()
defineEmits<{ 'update:group': [group: Group]; 'update:tail': [tail: boolean]; earlier: [] }>()
const GROUPS: { key: Group; label: string }[] = [{ key: 'all', label: 'All' }, { key: 'agent', label: 'Agent' }, { key: 'system', label: 'System' }, { key: 'errors', label: 'Errors' }]
const tone = (type: string): string => (type === 'blocked' || type === 'error' ? 'k-bad' : type === 'turn_end' ? 'k-ok' : type === 'tool' ? 'k-info' : '')
// the API sends scalar values only; show them as key=value, nothing else
const data = (e: EventRow): string => Object.entries(e.data).map(([k, v]) => `${k}=${String(v)}`).join(' ')
// The view sticks to the bottom until the user scrolls up, and sticks again when they scroll back down.
const box = ref<HTMLElement | null>(null)
let stick = true
const onScroll = (): void => { const el = box.value; if (el) stick = el.scrollTop + el.clientHeight >= el.scrollHeight - 8 }
const toBottom = async (): Promise<void> => { await nextTick(); const el = box.value; if (el && stick) el.scrollTop = el.scrollHeight }
watch(() => props.lines.at(-1)?.n, toBottom)
onMounted(toBottom)
const pad = (n: number): string => String(n).padStart(6, '0')
</script>

<template>
  <NwCard title="Event stream" :note="`${total} events`">
    <div class="bar">
      <span class="seg" role="group" aria-label="Filter">
        <button v-for="g in GROUPS" :key="g.key" type="button" :aria-pressed="group === g.key" @click="$emit('update:group', g.key)">{{ g.label }}</button>
      </span>
      <span class="seg"><button type="button" :aria-pressed="tail" @click="$emit('update:tail', !tail)">Tail: {{ tail ? 'on' : 'off' }}</button></span>
    </div>
    <p v-if="hasEarlier" class="foot top"><button type="button" class="link" data-earlier @click="$emit('earlier')">Show 200 earlier lines</button></p>
    <p v-if="lines.length === 0" class="empty">No events yet.</p>
    <div v-else ref="box" class="stream" data-stream role="region" aria-label="Event lines" tabindex="0" @scroll="onScroll">
    <NwTable caption="Events, times UTC+7" dense>
      <template #head><tr><th scope="col" class="sr">Line</th><th scope="col" class="sr">Time (UTC+7)</th><th scope="col" class="sr">Type</th><th scope="col" class="sr">Data</th></tr></template>
      <tr v-for="e in lines" :key="e.n">
        <td data-label="Line" class="muted">{{ pad(e.n) }}</td>
        <td data-label="Time (UTC+7)" class="muted">{{ fmtClock(Date.parse(e.ts)) }}</td>
        <td data-label="Type" :class="tone(e.type)">{{ e.type }}</td>
        <td data-label="Data">{{ data(e) }}</td>
      </tr>
    </NwTable>
    </div>
  </NwCard>
</template>

<style scoped lang="scss">
.bar { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding: 8px 14px; border-bottom: 1px solid var(--nw-border); }
.seg { display: inline-flex; border: 1px solid var(--nw-border); border-radius: var(--nw-radius-sm); }
.seg button { background: none; border: 0; color: var(--nw-text-2); padding: 4px 10px; font: 11px var(--nw-sans); cursor: pointer; min-height: 24px; }
.seg button[aria-pressed='true'] { background: var(--nw-raised); color: var(--nw-text); }
.seg button:focus-visible, .link:focus-visible { outline: 2px solid var(--nw-primary); outline-offset: 1px; }
.stream { max-height: 480px; overflow: auto; }
.stream:focus-visible { outline: 2px solid var(--nw-primary); outline-offset: -2px; }
.top { border-top: 0; border-bottom: 1px solid var(--nw-border); }
.link { background: none; border: 0; padding: 0; font: inherit; color: var(--nw-primary); cursor: pointer; text-decoration: underline; min-height: 24px; }
@media (max-width: 760px) { .seg button, .link { min-height: 44px; } }
</style>
