import { describe, expect, it } from 'vitest'
import { filterAgents } from './agent-filter'
import { liveFixture } from '../../tests/oculus-fixtures'

const agents = liveFixture().agents
const none = { status: '', role: '', project: '', workspace: '' }
describe('filterAgents', () => {
  it('no filter keeps all, in order', () => expect(filterAgents(agents, none)).toEqual(agents))
  it('each filter narrows, and they combine', () => {
    expect(filterAgents(agents, { ...none, status: 'working' }).map((a) => a.name)).toEqual(['dgs-590', 'dgs-590-rev1'])
    expect(filterAgents(agents, { ...none, role: 'conductor', workspace: 'w3' }).map((a) => a.name)).toEqual(['emma-conductor'])
    expect(filterAgents(agents, { ...none, project: 'shoppable-video' }).map((a) => a.name)).toEqual(['dgs-571'])
  })
})
