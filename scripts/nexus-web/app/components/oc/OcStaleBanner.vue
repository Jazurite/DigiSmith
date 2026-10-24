<script setup lang="ts">
import { computed } from 'vue'
import { fmtClock } from '../../utils/oc-format'

const props = defineProps<{ failedAt?: number | null }>()
// HH:MM in UTC+7, no seconds, no error code
const at = computed(() => (props.failedAt ? fmtClock(props.failedAt).slice(0, 5) : null))
</script>

<template>
  <p class="oc-banner" role="status">The last update failed<template v-if="at"> at {{ at }} (UTC+7)</template>. Showing the last good data, it may be old.</p>
</template>

<style lang="scss">
.oc-banner { background: var(--oc-raised); border: 1px solid var(--oc-border); border-left: 3px solid var(--oc-warn); padding: 8px 12px; margin: 0 0 16px; color: var(--oc-text-2); }
// the last good data after the banner is dimmed (greyed, not faded: a fade would break the text contrast) so it never looks current
.oc-banner ~ * { filter: grayscale(0.9); }
</style>
