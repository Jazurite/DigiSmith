<script setup lang="ts">
defineProps<{ title: string; note?: string }>()
</script>

<template>
  <section class="oc-card">
    <h3>{{ title }}<small v-if="note">{{ note }}</small></h3>
    <slot />
  </section>
</template>

<style lang="scss">
// unscoped on purpose, like OcTable: the body comes from the page that fills the slot
.oc-card { background: var(--oc-surface); border: 1px solid var(--oc-border); border-radius: var(--oc-radius-sm); margin-bottom: 16px; min-width: 0; }
.oc-card > h3 { margin: 0; padding: 12px 14px; font-size: 13px; border-bottom: 1px solid var(--oc-border); display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.oc-card > h3 small { font: 11px var(--oc-mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--oc-text-3); font-weight: 400; }
.oc-card .empty { padding: 22px 14px; color: var(--oc-text-2); margin: 0; }
.oc-card .foot { padding: 8px 14px; border-top: 1px solid var(--oc-border); color: var(--oc-text-3); font: 11px var(--oc-mono); margin: 0; }
.oc-card .kv { display: grid; grid-template-columns: 110px 1fr; gap: 6px 10px; padding: 12px 14px; font: 11px var(--oc-mono); margin: 0; }
.oc-card .kv dt { color: var(--oc-text-3); font-family: var(--oc-sans); }
.oc-card .kv dd { margin: 0; }
.oc-card .tag { font: 11px var(--oc-mono); border: 1px solid var(--oc-strong); border-radius: 2px; padding: 1px 5px; color: var(--oc-text-2); }
</style>
