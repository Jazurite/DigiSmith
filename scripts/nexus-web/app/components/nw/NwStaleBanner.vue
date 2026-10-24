<script setup lang="ts">
import { computed } from 'vue'
import { fmtClock } from '../../utils/nw-format'

const props = defineProps<{ failedAt?: number | null }>()
// HH:MM in UTC+7, no seconds, no error code
const at = computed(() => (props.failedAt ? fmtClock(props.failedAt).slice(0, 5) : null))
</script>

<template>
  <p class="nw-banner" role="status">The last update failed<template v-if="at"> at {{ at }} (UTC+7)</template>. Showing the last good data, it may be old.</p>
</template>

<style lang="scss">
.nw-banner { background: var(--nw-raised); border: 1px solid var(--nw-border); border-left: 3px solid var(--nw-warn); padding: 8px 12px; margin: 0 0 16px; color: var(--nw-text-2); }
// the last good data after the banner is dimmed (greyed, not faded: a fade would break the text contrast) so it never looks current
.nw-banner ~ * { filter: grayscale(0.9); }
</style>
