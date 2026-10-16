<script setup lang="ts">
defineProps<{ rows: number; ghost: boolean }>()
</script>

<template>
  <div class="skeleton" :class="{ ghost }" aria-hidden="true">
    <div class="ruler-ph" />
    <div v-for="r in rows" :key="r" class="srow" :class="{ 'decade-end': r % 10 === 0 && r < rows }" />
  </div>
</template>

<style scoped lang="scss">
@use '../assets/grid' as g;
.skeleton { @include g.grid-geometry; animation: pulse 1.4s ease-in-out infinite; }
.ruler-ph { height: g.$ruler-h; margin-bottom: g.$ruler-gap; }   // same height as the real ruler row
.srow {
  @include g.row-geometry;
  display: block;   // the pattern draws the 52 boxes; no child nodes
  margin-bottom: var(--gap);
  margin-left: calc(var(--age-w) + var(--gap));
  width: calc(100% - var(--age-w) - var(--gap));
  background-image: linear-gradient(to right, var(--line) 0 var(--box), transparent var(--box) 100%);
  background-size: calc(var(--box) + var(--gap)) 100%;
  border-radius: var(--radius-box);
}
.decade-end { margin-bottom: calc(var(--gap) + #{g.$decade-gap}); }
.ghost { animation: none; opacity: 0.28; }
@keyframes pulse { 50% { opacity: 0.45; } }
</style>
