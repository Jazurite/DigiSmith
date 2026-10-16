import WidgetFrame from './WidgetFrame.vue'

const meta = { title: 'Components/Widget frame', component: WidgetFrame }
export default meta

export const WithMetaAndNote = {
  args: { title: 'Life calendar', meta: 'Born 1990-01-01 · 90 years' },
  render: (args: Record<string, unknown>) => ({
    components: { WidgetFrame },
    setup: () => ({ args }),
    template: '<WidgetFrame v-bind="args"><p>Widget content goes here.</p><template #note>A note under the widget.</template></WidgetFrame>',
  }),
}
