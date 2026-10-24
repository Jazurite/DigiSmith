import TokensCard from './TokensCard.vue'
import { tokensFixture, unpricedTokensFixture } from '../../../tests/oculus-fixtures'

const meta = {
  title: 'Oculus/TokensCard', component: TokensCard,
  decorators: [() => ({ template: '<div class="oc"><story /></div>' })],
}
export default meta

const fresh = tokensFixture()
export const Fresh = { args: { tokens: { ...fresh, final: true }, asOf: fresh.generatedAt } }
export const Counting = { args: { tokens: fresh, asOf: fresh.generatedAt } }
export const Unpriced = { args: { tokens: unpricedTokensFixture(), asOf: fresh.generatedAt } }
export const Stale = { args: { tokens: null, asOf: '2026-10-22T02:15:00.000Z' } }
export const None = { args: { tokens: null, asOf: null } }
