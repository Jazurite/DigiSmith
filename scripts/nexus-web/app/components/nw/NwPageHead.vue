<script setup lang="ts">
defineProps<{ title: string; sub: string }>()
</script>

<template>
  <h1>{{ title }}</h1>
  <p class="nw-sub">{{ sub }}</p>
</template>

<style lang="scss">
.nw-sub { color: var(--nw-text-2); margin: 0 0 18px; }
</style>
