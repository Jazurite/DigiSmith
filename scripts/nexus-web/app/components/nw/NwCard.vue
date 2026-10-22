<script setup lang="ts">
defineProps<{ title: string; note?: string }>()
</script>

<template>
  <section class="nw-card">
    <h3>{{ title }}<small v-if="note">{{ note }}</small></h3>
    <slot />
  </section>
</template>

<style lang="scss">
// unscoped on purpose, like NwTable: the body comes from the page that fills the slot
.nw-card { background: var(--nw-surface); border: 1px solid var(--nw-border); border-radius: var(--nw-radius-sm); margin-bottom: 16px; min-width: 0; }
.nw-card > h3 { margin: 0; padding: 12px 14px; font-size: 13px; border-bottom: 1px solid var(--nw-border); display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.nw-card > h3 small { font: 11px var(--nw-mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--nw-text-3); font-weight: 400; }
.nw-card .empty { padding: 22px 14px; color: var(--nw-text-2); margin: 0; }
.nw-card .foot { padding: 8px 14px; border-top: 1px solid var(--nw-border); color: var(--nw-text-3); font: 11px var(--nw-mono); margin: 0; }
.nw-card .kv { display: grid; grid-template-columns: 110px 1fr; gap: 6px 10px; padding: 12px 14px; font: 11px var(--nw-mono); margin: 0; }
.nw-card .kv dt { color: var(--nw-text-3); font-family: var(--nw-sans); }
.nw-card .kv dd { margin: 0; }
.nw-card .tag { font: 11px var(--nw-mono); border: 1px solid var(--nw-strong); border-radius: 2px; padding: 1px 5px; color: var(--nw-text-2); }
</style>
