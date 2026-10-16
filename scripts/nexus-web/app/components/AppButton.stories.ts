import AppButton from './AppButton.vue'

const meta = {
  title: 'Components/App button',
  component: AppButton,
  render: (args: Record<string, unknown>) => ({ components: { AppButton }, setup: () => ({ args }), template: '<AppButton v-bind="args">Try again</AppButton>' }),
}
export default meta

export const Default = {}
export const Busy = { args: { busy: true, busyLabel: 'Retrying…' } }
