import NwTable from './NwTable.vue'
import NwStatus from './NwStatus.vue'
import { overviewFixture } from '../../../tests/nightwatch-fixtures'

const meta = {
  title: 'Nightwatch/Table', component: NwTable,
  decorators: [() => ({ template: '<div class="nw"><story /></div>' })],
}
export default meta

export const Workers = {
  render: () => ({
    components: { NwTable, NwStatus },
    setup: () => ({ rows: overviewFixture().workers }),
    template: `<NwTable caption="Active workers">
      <template #head><tr><th>Health</th><th>Key</th><th>Role</th><th class="num">Events</th></tr></template>
      <tr v-for="r in rows" :key="r.run"><td><NwStatus :state="r.state" /></td><td class="mono">{{ r.ticket }}</td><td>{{ r.role }}</td><td class="num">{{ r.events }}</td></tr>
    </NwTable>`,
  }),
}
