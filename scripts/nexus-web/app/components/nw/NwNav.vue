<script setup lang="ts">
defineProps<{ attention: number; current: string }>()
const LINKS = [
  { key: 'operations', to: '/nightwatch/', label: 'Operations' },
  { key: 'attention', to: '/nightwatch/attention/', label: 'Attention' },
  { key: 'runs', to: '/nightwatch/runs/', label: 'Runs' },
  { key: 'plan', to: '/nightwatch/plan/', label: 'Plan' },
] as const
</script>

<template>
  <nav class="nw-nav" aria-label="Nightwatch">
    <div class="brand">nightwatch</div>
    <h2>Watch</h2>
    <NuxtLink v-for="l in LINKS" :key="l.key" :to="l.to" class="link" :aria-current="current === l.key ? 'page' : undefined">
      {{ l.label }}
      <span v-if="l.key === 'attention' && attention > 0" class="badge">{{ attention }}</span>
    </NuxtLink>
  </nav>
</template>

<style scoped lang="scss">
.nw-nav { background: var(--nw-sidebar); border-right: 1px solid var(--nw-border); padding: 16px 10px; }
.brand { font-weight: 600; font-size: 14px; line-height: 16px; padding: 0 8px 16px; }
h2 { font: 600 11px/14px var(--nw-mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--nw-text-3); margin: 16px 8px 6px; }
.link { display: flex; justify-content: space-between; align-items: center; min-height: 32px; padding: 8px; border-radius: var(--nw-radius-sm); color: var(--nw-text-2); text-decoration: none; }
.link:hover { background: var(--nw-hover); }
.link[aria-current='page'] { background: var(--nw-raised); color: var(--nw-text); }
.link:focus-visible { outline: 2px solid var(--nw-primary); outline-offset: 1px; }
.badge { font-family: var(--nw-mono); color: var(--nw-bad); }
@media (max-width: 760px) {
  .nw-nav { display: flex; overflow-x: auto; padding: 6px; border-right: 0; border-bottom: 1px solid var(--nw-border); }
  .brand, h2 { display: none; }
  .link { white-space: nowrap; gap: 8px; }
}
</style>
