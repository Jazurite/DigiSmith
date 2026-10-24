<script setup lang="ts">
import type { RunDetail } from '#oculus-schema'

defineProps<{ order: RunDetail['order'] }>()
</script>

<template>
  <NwCard title="Order" note="read-only">
    <pre v-if="order.available" class="order">{{ order.text }}</pre>
    <p v-else class="empty">Order not available</p>
  </NwCard>
</template>

<style scoped lang="scss">
.order { margin: 0; padding: 12px 14px; font: 11px var(--nw-mono); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 280px; overflow: auto; }
</style>
