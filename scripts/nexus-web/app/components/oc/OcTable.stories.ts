import OcTable from './OcTable.vue'
import OcStatus from './OcStatus.vue'
import { overviewFixture } from '../../../tests/oculus-fixtures'

const meta = {
  title: 'Oculus/Table', component: OcTable,
  decorators: [() => ({ template: '<div class="oc"><story /></div>' })],
}
export default meta

export const Workers = {
  render: () => ({
    components: { OcTable, OcStatus },
    setup: () => ({ rows: overviewFixture().workers }),
    template: `<OcTable caption="Active workers">
      <template #head><tr><th>Health</th><th>Key</th><th>Role</th><th class="num">Events</th></tr></template>
      <tr v-for="r in rows" :key="r.run"><td><OcStatus :state="r.state" /></td><td class="mono">{{ r.ticket }}</td><td>{{ r.role }}</td><td class="num">{{ r.events }}</td></tr>
    </OcTable>`,
  }),
}
