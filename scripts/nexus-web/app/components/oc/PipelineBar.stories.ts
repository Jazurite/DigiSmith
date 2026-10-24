import PipelineBar from './PipelineBar.vue'
import { runDetailFixture } from '../../../tests/oculus-fixtures'

const meta = {
  title: 'Oculus/PipelineBar', component: PipelineBar,
  decorators: [() => ({ template: '<div class="oc"><story /></div>' })],
}
export default meta

const steps = runDetailFixture().pipeline
export const Running = { args: { steps } }
export const Lost = { args: { steps: steps.map((s) => (s.state === 'current' ? { ...s, state: 'lost' as const } : s)) } }
export const Merged = { args: { steps: steps.map((s) => ({ ...s, at: s.at ?? '2026-10-22T04:20:00.000Z', state: 'done' as const })) } }
