import NwShell from './NwShell.vue'
import NwTable from './NwTable.vue'
import NwStatus from './NwStatus.vue'
import NwTopBar from './NwTopBar.vue'
import { overviewFixture } from '../../../tests/nightwatch-fixtures'

const meta = {
  title: 'Nightwatch/Shell', component: NwShell,
  decorators: [() => ({ template: '<div class="nw"><story /></div>' })],
  parameters: { layout: 'fullscreen' },
}
export default meta

export const WithTable = {
  render: () => ({
    components: { NwShell, NwTable, NwStatus, NwTopBar },
    setup: () => ({ o: overviewFixture(), updated: Date.parse('2026-10-22T03:42:10Z') }),
    template: `<NwShell :attention="o.attentionCount">
      <template #topbar><NwTopBar :overview="o" :stale="false" :updated-at="updated" /></template>
      <h1>Operations</h1>
      <NwTable caption="Active workers">
        <template #head><tr><th>Health</th><th>Key</th><th>Role</th></tr></template>
        <tr v-for="r in o.workers" :key="r.run"><td><NwStatus :state="r.state" /></td><td class="mono">{{ r.ticket }}</td><td>{{ r.role }}</td></tr>
      </NwTable>
    </NwShell>`,
  }),
}
