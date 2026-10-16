<script setup lang="ts">
import type { LifeCalendar } from '#life-schema'
defineProps<{ data: LifeCalendar }>()
</script>

<template>
  <div class="loaded" />
</template>
