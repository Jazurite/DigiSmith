<script setup lang="ts">
import { computed, inject } from 'vue'
import { NOW_KEY } from '../../utils/use-now'

// Renderless: the slot runs in this component's render, so a tick of the page clock re-renders only the time text inside it, never the table around it.
// A story or a test passes nowMs and the clock is fixed; a page passes nothing and the injected page clock is used.
const props = defineProps<{ nowMs?: number }>()
const clock = inject(NOW_KEY, null)
const now = computed(() => props.nowMs ?? clock?.value ?? Date.now())
defineSlots<{ default(p: { nowMs: number }): unknown }>()
</script>

<template><slot :now-ms="now" /></template>
