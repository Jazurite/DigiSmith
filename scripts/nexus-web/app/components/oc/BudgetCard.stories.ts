import BudgetCard from './BudgetCard.vue'

const meta = {
  title: 'Oculus/BudgetCard', component: BudgetCard,
  decorators: [() => ({ template: '<div class="oc"><story /></div>' })],
}
export default meta

export const Default = { args: { budget: { phase: 'building' as const, limitMin: 45, elapsedMin: 41, building: 45, review: 60, merge: 20 } } }
export const Over = { args: { budget: { phase: 'review' as const, limitMin: 60, elapsedMin: 75, building: 45, review: 60, merge: 20 } } }
