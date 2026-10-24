import OcShell from './OcShell.vue'
import OcTable from './OcTable.vue'
import OcStatus from './OcStatus.vue'
import OcTopBar from './OcTopBar.vue'
import { overviewFixture } from '../../../tests/oculus-fixtures'

const meta = {
  title: 'Oculus/Shell', component: OcShell,
  decorators: [() => ({ template: '<div class="oc"><story /></div>' })],
  parameters: { layout: 'fullscreen' },
}
export default meta

export const WithTable = {
  render: () => ({
    components: { OcShell, OcTable, OcStatus, OcTopBar },
    setup: () => ({ o: overviewFixture(), updated: Date.parse('2026-10-22T03:42:10Z') }),
    template: `<OcShell :attention="o.attentionCount">
      <template #topbar><OcTopBar :overview="o" :stale="false" :updated-at="updated" /></template>
      <h1>Operations</h1>
      <OcTable caption="Active workers">
        <template #head><tr><th>Health</th><th>Key</th><th>Role</th></tr></template>
        <tr v-for="r in o.workers" :key="r.run"><td><OcStatus :state="r.state" /></td><td class="mono">{{ r.ticket }}</td><td>{{ r.role }}</td></tr>
      </OcTable>
    </OcShell>`,
  }),
}
