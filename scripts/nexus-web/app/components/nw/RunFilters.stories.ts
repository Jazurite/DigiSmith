import RunFilters from './RunFilters.vue'

const meta = {
  title: 'Nightwatch/RunFilters', component: RunFilters,
  decorators: [() => ({ template: '<div class="nw"><story /></div>' })],
}
export default meta

export const Default = { args: { modelValue: { state: '', role: 'builder', trigger: '', ticket: '' } } }
