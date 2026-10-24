<script setup lang="ts">
import type { RunDetail } from '#oculus-schema'
import { fmtTokens, fmtUsd, fmtUtc7 } from '../../utils/oc-format'

defineProps<{ tokens: RunDetail['tokens']; asOf: string | null }>()
const cols = ['input', 'output', 'cacheRead', 'cacheWrite5m', 'cacheWrite1h', 'tokens'] as const
const heads = ['Input', 'Output', 'Cache read', 'Cache write 5m', 'Cache write 1h', 'Tokens']
</script>

<template>
  <OcCard title="Tokens and cost" note="list price">
    <template v-if="tokens">
      <OcTable caption="Tokens and cost by model" dense>
        <template #head>
          <tr><th scope="col">Model</th><th v-for="h in heads" :key="h" scope="col" class="num">{{ h }}</th><th scope="col" class="num">Cost</th></tr>
        </template>
        <tr v-for="m in tokens.models" :key="m.model">
          <td data-label="Model" class="mono">{{ m.model }}</td>
          <td v-for="(c, i) in cols" :key="c" class="num" :data-label="heads[i]" :title="String(m[c])">{{ fmtTokens(m[c]) }}</td>
          <td data-label="Cost" class="num" :class="{ muted: m.costUsd === null }" :title="m.costUsd === null ? 'unpriced model' : `list price $${m.costUsd.toFixed(4)}`">{{ fmtUsd(m.costUsd) }}</td>
        </tr>
        <tr class="total">
          <th scope="row">Total</th>
          <td :colspan="cols.length - 1" class="gap" />
          <td data-label="Tokens" class="num" :title="String(tokens.total.tokens)"><b>{{ fmtTokens(tokens.total.tokens) }}</b></td>
          <td data-label="Cost" class="num" :class="{ muted: tokens.total.costUsd === null }" :title="tokens.total.costUsd === null ? `unpriced model: ${tokens.unpriced.join(', ')}` : undefined"><b>{{ fmtUsd(tokens.total.costUsd) }}</b></td>
        </tr>
      </OcTable>
      <p class="foot">Anthropic price table {{ tokens.priceVersion }} · as of {{ fmtUtc7(tokens.generatedAt) }} (UTC+7)<template v-if="!tokens.final"> · counting</template></p>
    </template>
    <p v-else-if="asOf" class="empty">Stale since {{ fmtUtc7(asOf) }} (UTC+7).</p>
    <p v-else class="empty">No token snapshot.</p>
  </OcCard>
</template>

<style scoped lang="scss">
.total td, .total th { border-top: 1px solid var(--oc-strong); }
.total th { text-align: left; font-weight: 700; color: var(--oc-text); background: none; text-transform: none; letter-spacing: 0; font: 700 11px/16px var(--oc-mono); padding: 5px 14px; }
// the gap cell only spans the empty columns on a desktop table
@media (max-width: 760px) {
  .total th { display: block; padding: 4px 14px; }
  .total td.gap { display: none; }
}
</style>
