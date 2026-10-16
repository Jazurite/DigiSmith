<script setup lang="ts">
defineProps<{ busy?: boolean; busyLabel?: string }>()
defineEmits<{ click: [] }>()
</script>

<template>
  <button type="button" class="btn" :disabled="busy" @click="$emit('click')">
    <slot v-if="!busy" />
    <template v-else>{{ busyLabel ?? 'Working…' }}</template>
  </button>
</template>

<style scoped lang="scss">
.btn { min-height: 44px; padding: 0 20px; border: 0; border-radius: 8px; background: var(--ink); color: var(--bg); font: inherit; font-weight: 600; cursor: pointer; transition: opacity 120ms ease-out; }
.btn:hover { opacity: 0.88; }
.btn:disabled { opacity: 0.6; cursor: default; }
.btn:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; box-shadow: 0 0 0 2px var(--bg); }
</style>
