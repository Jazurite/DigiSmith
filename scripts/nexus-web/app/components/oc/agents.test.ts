// scripts/nexus-web/app/components/oc/agents.test.ts
// mountSuspended (not plain mount), like runs.test.ts: the components use the Nuxt auto-imports (OcTable, NuxtLink).
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import OcAgentsTable from './OcAgentsTable.vue'
import OcTopBar from './OcTopBar.vue'
import { liveFixture } from '../../../tests/oculus-fixtures'

const live = liveFixture()
const down = { ...live, herdr: { state: 'disconnected' as const, asOf: '2026-10-22T02:20:00.000Z' } }
describe('OcAgentsTable', () => {
  it('one row per agent, with the role, project, status word, place and run link', async () => {
    const w = await mountSuspended(OcAgentsTable, { props: { agents: live.agents, disconnected: false } })
    expect(w.findAll('tbody tr')).toHaveLength(7)
    expect(w.text()).toContain('unnamed')
    expect(w.find('a[href="/run/?id=builder-20261022T021000-a1b2c3"]').exists()).toBe(true)
    expect(w.find('td[data-label="Where"]').text()).toBe('w2 · t7')
  })
  it('only working is green; disconnected makes every dot neutral and no green at all', async () => {
    const on = await mountSuspended(OcAgentsTable, { props: { agents: live.agents, disconnected: false } })
    expect(on.findAll('.st.ok').map((e) => e.text())).toEqual(['working', 'working'])
    const off = await mountSuspended(OcAgentsTable, { props: { agents: live.agents, disconnected: true } })
    expect(off.findAll('.st.ok')).toHaveLength(0)
    expect(off.findAll('.st.hollow')).toHaveLength(7)
  })
})
describe('OcTopBar agents count', () => {
  it('shows the counts and links to /#agents', async () => {
    const w = await mountSuspended(OcTopBar, { props: { overview: null, stale: false, updatedAt: null, live } })
    const a = w.find('a[href="/#agents"]')
    expect(a.text().replace(/\s+/g, ' ')).toBe('Agents 7 · working 2 · blocked 1')
  })
  it('disconnected keeps the last count with a marker, never "unknown"', async () => {
    const w = await mountSuspended(OcTopBar, { props: { overview: null, stale: false, updatedAt: null, live: down } })
    expect(w.find('a[href="/#agents"]').text().replace(/\s+/g, ' ')).toBe('Agents 7 · working 2 · blocked 1 · disconnected')
    expect(w.text()).not.toMatch(/Agents unknown/)
  })
  it('stale live data gives the agents item the warn tone, fresh data does not', async () => {
    const fresh = await mountSuspended(OcTopBar, { props: { overview: null, stale: false, updatedAt: null, live, liveStale: false } })
    expect(fresh.find('a.agents').classes()).not.toContain('warn')
    const old = await mountSuspended(OcTopBar, { props: { overview: null, stale: false, updatedAt: null, live, liveStale: true } })
    expect(old.find('a.agents').classes()).toContain('warn')
  })
})
