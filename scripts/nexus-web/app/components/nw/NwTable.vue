<script setup lang="ts">
import { onMounted, onUpdated, ref } from 'vue'

defineProps<{ caption?: string; dense?: boolean }>()
// The mobile row cards use display:block, which drops the table semantics in some screen readers.
// The rows and cells come from the page's slots, so the roles are set on the elements after each render.
const table = ref<HTMLElement | null>(null)
const ROLES: Record<string, string> = { TR: 'row', TD: 'cell', TH: 'columnheader' }
function applyRoles(): void {
  table.value?.querySelectorAll('tr, td, th').forEach((el) => { const r = ROLES[el.tagName]; if (r && el.getAttribute('role') !== r) el.setAttribute('role', r) })
}
onMounted(applyRoles)
onUpdated(applyRoles)
</script>

<template>
  <table ref="table" class="nw-table" :class="{ dense }" role="table">
    <caption v-if="caption" class="sr">{{ caption }}</caption>
    <thead role="rowgroup"><slot name="head" /></thead>
    <tbody role="rowgroup"><slot /></tbody>
  </table>
</template>

<style lang="scss">
// unscoped on purpose: the rows and cells come from the page that fills the slots
.nw-table { width: 100%; border-collapse: collapse; }
.nw-table th { text-align: left; background: var(--nw-thead); font: 600 11px/14px var(--nw-mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--nw-text-3); padding: 8px 14px; }
.nw-table td { padding: 9px 14px; border-top: 1px solid var(--nw-border); }
.nw-table td.num, .nw-table th.num { text-align: right; font-family: var(--nw-mono); }
.nw-table td.mono { font-family: var(--nw-mono); }
.nw-table .muted { color: var(--nw-text-3); }
.nw-table.dense { font: 11px/16px var(--nw-mono); }
.nw-table.dense td { padding: 5px 14px; }
.nw-table a { color: var(--nw-primary); min-height: 24px; display: inline-block; }
.nw-table a:focus-visible { outline: 2px solid var(--nw-primary); outline-offset: 2px; }
@media (max-width: 760px) {
  // row cards: the header row hides (still read by screen readers), each row is a card, each cell shows its data-label
  .nw-table, .nw-table tbody, .nw-table tr, .nw-table td { display: block; width: 100%; }
  .nw-table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .nw-table tr { border-top: 1px solid var(--nw-border); padding: 6px 0; }
  .nw-table td { border-top: 0; padding: 4px 14px; display: flex; gap: 12px; justify-content: space-between; align-items: baseline; text-align: right; overflow-wrap: anywhere; }
  .nw-table td::before { content: attr(data-label); flex: none; text-align: left; font: 600 11px/14px var(--nw-mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--nw-text-3); }
  .nw-table td.num { text-align: right; }
}
.nw-table .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
