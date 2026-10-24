import { describe, expect, it } from 'vitest'
import { agentChanges } from './agent-changes'
import { liveFixture } from '../../tests/oculus-fixtures'

const live = liveFixture()
const without = (name: string) => ({ ...live, agents: live.agents.filter((a) => a.name !== name) })
describe('agentChanges: sets of names, never the whole table', () => {
  it('says nothing on the first answer or when nothing changed', () => {
    expect(agentChanges(null, live)).toBe('')
    expect(agentChanges(live, live)).toBe('')
  })
  it('names new, gone and newly blocked agents', () => {
    const next = { ...without('dgs-571'), agents: [...without('dgs-571').agents.map((a) => (a.name === 'dgs-590' ? { ...a, status: 'blocked' as const } : a)), { ...live.agents[0]!, name: 'dgs-602', pane: 'w2:p10' }] }
    expect(agentChanges(live, next)).toBe('Blocked: dgs-590. New: dgs-602. Gone: dgs-571.')
  })
  it('an unnamed agent is named by its pane', () => {
    expect(agentChanges(live, { ...live, agents: live.agents.filter((a) => a.name !== null) })).toBe('Gone: w4:p2.')
  })
  it('announces the connection change once, before the names', () => {
    const down = { ...live, herdr: { state: 'disconnected' as const, asOf: '2026-10-22T02:20:00.000Z' } }
    expect(agentChanges(live, down)).toBe('Disconnected from herdr.')
    expect(agentChanges(down, down)).toBe('')
    expect(agentChanges(down, live)).toBe('Connected to herdr.')
  })
})
