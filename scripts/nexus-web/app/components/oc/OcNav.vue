<script setup lang="ts">
withDefaults(defineProps<{ attention: number; current: string; blocked?: number }>(), { blocked: 0 })
const LINKS = [
  { key: 'oculus', to: '/', label: 'Oculus' },
  { key: 'attention', to: '/attention/', label: 'Attention' },
  { key: 'runs', to: '/runs/', label: 'Runs' },
  { key: 'plan', to: '/plan/', label: 'Plan' },
] as const
</script>

<template>
  <nav class="oc-nav" aria-label="Oculus">
    <div class="brand">Oculus</div>
    <h2>Watch</h2>
    <NuxtLink v-for="l in LINKS" :key="l.key" :to="l.to" class="link" :aria-current="current === l.key ? 'page' : undefined">
      {{ l.label }}
      <span v-if="l.key === 'oculus' && blocked > 0" class="badge">{{ blocked }}<span class="sr-only"> blocked</span></span>
      <span v-if="l.key === 'attention' && attention > 0" class="badge">{{ attention }}</span>
    </NuxtLink>
  </nav>
</template>

<style scoped lang="scss">
// DGS-599: 16 px nav padding + the 8 px inner padding of the brand, the label and the links = the 24 px page gutter. env() is 0 without an inset.
.oc-nav { background: var(--oc-sidebar); border-right: 1px solid var(--oc-border); padding: 16px 10px; padding-inline-start: max(16px, env(safe-area-inset-left)); }
.brand { font-weight: 600; font-size: 14px; line-height: 16px; padding: 0 8px 16px; }
h2 { font: 600 11px/14px var(--oc-mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--oc-text-3); margin: 16px 8px 6px; }
.link { display: flex; justify-content: space-between; align-items: center; min-height: 32px; padding: 8px; border-radius: var(--oc-radius-sm); color: var(--oc-text-2); text-decoration: none; }
.link:hover { background: var(--oc-hover); }
.link[aria-current='page'] { background: var(--oc-raised); color: var(--oc-text); }
.link:focus-visible { outline: 2px solid var(--oc-primary); outline-offset: 1px; }
.badge { font-family: var(--oc-mono); color: var(--oc-bad); }
@media (max-width: 760px) {
  .oc-nav { display: flex; overflow-x: auto; padding: 6px max(16px, env(safe-area-inset-right)) 6px max(16px, env(safe-area-inset-left)); border-right: 0; border-bottom: 1px solid var(--oc-border); }
  .brand, h2 { display: none; }
  .link { white-space: nowrap; gap: 8px; }
}
</style>
