// scripts/nexus-web/app/components/oc/shell.test.ts
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import OcNav from './OcNav.vue'
import OcPanel from './OcPanel.vue'
import OcShell from './OcShell.vue'
import OcStatus from './OcStatus.vue'
import OcTable from './OcTable.vue'
import OcTopBar from './OcTopBar.vue'
import { overviewFixture } from '../../../tests/oculus-fixtures'

describe('OcTopBar', () => {
  it('shows health, workers, Ready waiting, the mode and the two not-measured slots', async () => {
    const w = await mountSuspended(OcTopBar, { props: { overview: overviewFixture(), stale: false, updatedAt: Date.parse('2026-10-22T03:42:10Z') } })
    const t = w.text()
    expect(t).toContain('Nexus healthy')
    expect(t).toContain('Workers 2')
    expect(t).toContain('Ready waiting 5')
    expect(t).toContain('away')
    expect(t).toContain('10:42:10 (UTC+7)')
    expect(w.findAll('[title="not measured"]')).toHaveLength(2)
    expect(w.find('[role="status"]').exists()).toBe(true)
  })
  it('says unreachable when there is no data and the last fetch failed', async () => {
    const w = await mountSuspended(OcTopBar, { props: { overview: null, stale: true, updatedAt: null } })
    expect(w.text()).toContain('Nexus unreachable')
  })
  it('shows unknown in words with a hollow, non-green dot', async () => {
    const o = overviewFixture()
    const u = await mountSuspended(OcTopBar, { props: { overview: { ...o, nexus: { status: 'unknown', reasons: [] } }, stale: false, updatedAt: 1 } })
    expect(u.text()).toContain('Nexus unknown')
    expect(u.find('.dot.hollow').exists()).toBe(true)
    expect(u.find('.dot.ok').exists()).toBe(false)
  })
  it('shows stale in amber with the age when the last poll failed, never a green healthy', async () => {
    const w = await mountSuspended(OcTopBar, { props: { overview: overviewFixture(), stale: true, updatedAt: Date.now() - 125_000 } })
    expect(w.text()).toContain('Nexus stale 2m')
    expect(w.text()).not.toContain('Nexus healthy')
    expect(w.find('.dot.warn').exists()).toBe(true)
    expect(w.find('.dot.ok').exists()).toBe(false)
  })
  it('keeps the live region on the health text only, not the per-poll time', async () => {
    const w = await mountSuspended(OcTopBar, { props: { overview: overviewFixture(), stale: false, updatedAt: Date.parse('2026-10-22T03:42:10Z') } })
    const live = w.find('[role="status"]')
    expect(live.text()).toContain('Nexus healthy')
    expect(live.text()).not.toContain('UTC+7')
    expect(live.find('time').exists()).toBe(false)
    expect(w.find('time').exists()).toBe(true)
  })
  it('shows a degraded and a breaker-open status in words', async () => {
    const o = overviewFixture()
    const d = await mountSuspended(OcTopBar, { props: { overview: { ...o, nexus: { status: 'degraded', reasons: ['scheduler off'] } }, stale: false, updatedAt: 1 } })
    expect(d.text()).toContain('Nexus degraded')
    const b = await mountSuspended(OcTopBar, { props: { overview: { ...o, nexus: { status: 'breaker-open', reasons: [] } }, stale: false, updatedAt: 1 } })
    expect(b.text()).toContain('Breaker open')
  })
})

describe('OcNav', () => {
  it('marks the current page and shows the attention badge only above zero', async () => {
    const w = await mountSuspended(OcNav, { props: { attention: 2, current: 'attention' } })
    expect(w.find('[aria-current="page"]').text()).toContain('Attention')
    expect(w.find('.badge').text()).toBe('2')
    const none = await mountSuspended(OcNav, { props: { attention: 0, current: 'runs' } })
    expect(none.find('.badge').exists()).toBe(false)
  })
})

describe('OcPanel', () => {
  it('error has role alert and a Retry that emits; busy blocks the click', async () => {
    const w = await mountSuspended(OcPanel, { props: { kind: 'error', title: 'The runs are not available.', retrying: false } })
    expect(w.find('[role="alert"]').exists()).toBe(true)
    await w.find('button').trigger('click')
    expect(w.emitted('retry')).toHaveLength(1)
    await w.setProps({ retrying: true })
    await w.find('button').trigger('click')
    expect(w.emitted('retry')).toHaveLength(1)
  })
  it('empty has role status and no button; loading is aria-busy', async () => {
    const e = await mountSuspended(OcPanel, { props: { kind: 'empty', title: 'Nothing waits for you.' } })
    expect(e.find('[role="status"]').exists()).toBe(true)
    expect(e.find('button').exists()).toBe(false)
    const l = await mountSuspended(OcPanel, { props: { kind: 'loading' } })
    expect(l.find('[aria-busy="true"]').exists()).toBe(true)
  })
  it('never shows an error code', async () => {
    const w = await mountSuspended(OcPanel, { props: { kind: 'error', title: 'Not available.' } })
    expect(w.text()).not.toMatch(/reader_unavailable|internal_invalid|\/api\//)
  })
})

describe('OcStatus', () => {
  it('always shows the word', async () => {
    for (const s of ['healthy', 'blocked', 'stalled', 'lost', 'ended', 'running'] as const) {
      expect((await mountSuspended(OcStatus, { props: { state: s } })).text()).toBe(s)
    }
  })
})

describe('OcShell and OcTable', () => {
  it('the shell renders the nav, the topbar slot and the main landmark with the slot content', async () => {
    const w = await mountSuspended(OcShell, { props: { attention: 3 }, slots: { default: '<p id="x">page</p>', topbar: '<div id="tb">bar</div>' } })
    expect(w.find('nav.oc-nav[aria-label="Nightwatch"]').exists()).toBe(true)
    expect(w.find('main#main #x').exists()).toBe(true)
    expect(w.find('#tb').exists()).toBe(true)
    expect(w.find('.badge').text()).toBe('3')
  })
  it('the table renders a caption, a head slot and body rows', async () => {
    const w = await mountSuspended(OcTable, { props: { caption: 'Workers' }, slots: { head: '<tr><th>Key</th></tr>', default: '<tr><td>DGS-590</td></tr>' } })
    expect(w.find('caption').text()).toBe('Workers')
    expect(w.find('thead th').text()).toBe('Key')
    expect(w.find('tbody td').text()).toBe('DGS-590')
  })
})
