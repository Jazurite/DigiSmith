<script setup lang="ts">
import { computed } from 'vue'
import { fmtClock } from '../../utils/oc-format'

const props = defineProps<{ asOf: string | null }>()
const at = computed(() => (props.asOf ? fmtClock(Date.parse(props.asOf)).slice(0, 5) : null))
</script>

<template>
  <!-- not a live region: the page's one polite region announces the change -->
  <p class="oc-disconnected"><template v-if="at">Disconnected from herdr, as of {{ at }} (UTC+7). Retrying.</template><template v-else>Disconnected from herdr. No agent list yet. Retrying.</template></p>
</template>

<style scoped lang="scss">
.oc-disconnected { background: var(--oc-raised); border: 1px solid var(--oc-border); border-left: 3px solid var(--oc-warn); padding: 8px 12px; margin: 0 0 12px; color: var(--oc-text-2); }
</style>
