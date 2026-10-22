<script setup lang="ts">
defineProps<{ caption?: string; dense?: boolean }>()
</script>

<template>
  <table class="nw-table" :class="{ dense }">
    <caption v-if="caption" class="sr">{{ caption }}</caption>
    <thead><slot name="head" /></thead>
    <tbody><slot /></tbody>
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
.nw-table .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
