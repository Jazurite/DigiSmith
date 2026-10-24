import RunFilters from './RunFilters.vue'

const meta = {
  title: 'Oculus/RunFilters', component: RunFilters,
  decorators: [() => ({ template: '<div class="oc"><story /></div>' })],
}
export default meta

export const Default = { args: { modelValue: { state: '', role: 'builder', trigger: '', project: '', ticket: '' }, projects: ['DigiSmith', 'emma-theme'] } }
