<script setup lang="ts">
import { computed } from 'vue'

defineProps<{ attention: number }>()
const route = useRoute()
const current = computed(() => {
  const p = route.path
  if (p.startsWith('/nightwatch/attention')) return 'attention'
  if (p.startsWith('/nightwatch/runs')) return 'runs'
  if (p.startsWith('/nightwatch/plan')) return 'plan'
  return 'operations'
})
</script>

<template>
  <div class="shell">
    <NwNav :attention="attention" :current="current" />
    <div class="body">
      <slot name="topbar" />
      <main id="main" class="main"><slot /></main>
    </div>
  </div>
</template>

<style scoped lang="scss">
.shell { display: grid; grid-template-columns: 200px 1fr; min-height: 100vh; background: var(--nw-bg); color: var(--nw-text); font: 12px/16px var(--nw-sans); }
.body { min-width: 0; }
.main { padding: 20px max(24px, env(safe-area-inset-right)) 48px max(24px, env(safe-area-inset-left)); }
@media (max-width: 760px) { .shell { grid-template-columns: 1fr; } .main { padding: 16px max(16px, env(safe-area-inset-right)) 16px max(16px, env(safe-area-inset-left)); } }
</style>
