<script setup lang="ts">
import { computed } from 'vue'
import type { Attention } from '#oculus-schema'
import { ageOf } from '../../utils/oc-format'
import { useNow } from '../../utils/use-now'

type AttentionItem = Attention['open'][number]
const props = defineProps<{ open: AttentionItem[] }>()
const nowMs = useNow()
// the newest five by `since`
const newest = computed(() => [...props.open].sort((a, b) => Date.parse(b.since) - Date.parse(a.since)).slice(0, 5))
</script>

<template>
  <OcCard title="Attention" :note="`${open.length} open`">
    <p v-if="open.length === 0" class="empty">Nothing waits on Jack.</p>
    <template v-else>
      <ul class="items">
        <li v-for="i in newest" :key="i.id"><span class="cause">{{ i.cause }}</span><span class="mono">{{ i.ticket ?? '-' }}</span><span class="mono muted">{{ ageOf(i.since, nowMs) }}</span></li>
      </ul>
      <p class="foot"><NuxtLink to="/attention/">All attention items</NuxtLink></p>
    </template>
  </OcCard>
</template>

<style scoped lang="scss">
.items { list-style: none; margin: 0; padding: 0; }
.items li { display: grid; grid-template-columns: 1fr auto auto; gap: 12px; padding: 9px 14px; border-top: 1px solid var(--oc-border); align-items: baseline; }
.items li:first-child { border-top: 0; }
.cause { overflow-wrap: anywhere; }
.mono { font-family: var(--oc-mono); }
.muted { color: var(--oc-text-3); }
.foot a { color: var(--oc-primary); min-height: 24px; display: inline-flex; align-items: center; }
.foot a:focus-visible { outline: 2px solid var(--oc-primary); outline-offset: 2px; }
</style>
