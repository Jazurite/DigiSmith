<script setup lang="ts">
defineProps<{ title: string; meta?: string }>()
const id = useId()
</script>

<template>
  <section class="widget" :aria-labelledby="id">
    <div class="title-row">
      <h2 :id="id">{{ title }}</h2>
      <span class="meta">{{ meta }}</span>
    </div>
    <slot />
    <p v-if="$slots.note" class="note"><slot name="note" /></p>
  </section>
</template>

<style scoped lang="scss">
.widget { max-width: 920px; margin: 0 auto; }
.title-row { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 4px 16px; margin-bottom: 16px; min-height: 28px; }
h2 { margin: 0; font-size: 20px; font-weight: 650; }
.meta { color: var(--ink-2); font-size: 13px; min-height: 1.4em; }
.note { margin: 16px 0 0; color: var(--ink-2); font-size: 13px; }
</style>
