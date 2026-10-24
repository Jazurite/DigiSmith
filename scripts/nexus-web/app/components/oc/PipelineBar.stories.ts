import PipelineBar from './PipelineBar.vue'
import { runDetailFixture } from '../../../tests/oculus-fixtures'

const meta = {
  title: 'Oculus/PipelineBar', component: PipelineBar,
  decorators: [() => ({ template: '<div class="oc"><story /></div>' })],
}
export default meta

const NOW = Date.parse('2026-10-22T03:00:00.000Z')
const steps = runDetailFixture().pipeline
export const Running = { args: { steps, nowMs: NOW } }
export const Lost = { args: { steps: steps.map((s) => (s.state === 'current' ? { ...s, state: 'lost' as const } : s)), nowMs: NOW } }
export const Merged = { args: { nowMs: NOW, steps: [
  { step: 'claimed', at: '2026-10-22T02:04:00.000Z', state: 'done', durationSec: 60 },
  { step: 'worktree-ready', at: '2026-10-22T02:05:00.000Z', state: 'done', durationSec: 0 },
  { step: 'building', at: '2026-10-22T02:05:00.000Z', state: 'done', durationSec: 4020 },
  { step: 'review', at: '2026-10-22T03:12:00.000Z', state: 'done', durationSec: 3420 },
  { step: 'merged', at: '2026-10-22T04:09:00.000Z', state: 'done', durationSec: 60 },
  { step: 'pushed', at: '2026-10-22T04:10:00.000Z', state: 'done', durationSec: null },
] } }
export const Manual = { args: { nowMs: NOW, steps: steps.map((s) => (s.step === 'claimed' ? { ...s, at: null, state: 'waiting' as const, durationSec: null } : s)) } }
