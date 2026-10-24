<script setup lang="ts">
defineProps<{ title: string; sub: string }>()
</script>

<template>
  <h1>{{ title }}</h1>
  <p class="oc-sub">{{ sub }}</p>
</template>

<style lang="scss">
.oc-sub { color: var(--oc-text-2); margin: 0 0 18px; }
</style>
