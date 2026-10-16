<script setup lang="ts">
defineProps<{ label: string; value?: string; loading?: boolean }>()
</script>

<template>
  <div class="stat">
    <dt>{{ label }}</dt>
    <dd v-if="!loading">{{ value ?? '–' }}</dd>
    <dd v-else class="bar" aria-hidden="true" />
  </div>
</template>

<style scoped lang="scss">
.stat { display: flex; flex-direction: column-reverse; gap: 2px; }   // number above the label, label first in the DOM
dt { color: var(--ink-2); font-size: 13px; }
dd { margin: 0; font-size: 26px; font-weight: 650; letter-spacing: -0.02em; line-height: 1.15; min-height: 30px; }
.bar { width: 72px; height: 22px; margin-top: 4px; border-radius: 4px; background: var(--line); }
@media (min-width: 640px) { dt { font-size: 14px; } dd { font-size: 36px; min-height: 42px; } .bar { height: 30px; width: 96px; } }
</style>
