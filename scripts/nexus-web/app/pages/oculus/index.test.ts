import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { liveFixture, overviewFixture } from '../../../tests/oculus-fixtures'
import Index from './index.vue'

const api = vi.hoisted(() => ({ loadAttention: vi.fn() }))
vi.mock('../../composables/oculus-api', async (orig) => ({ ...(await orig<typeof import('../../composables/oculus-api')>()), ...api }))
mockNuxtImport('useRoute', () => () => ({ query: {} }))
mockNuxtImport('navigateTo', () => vi.fn())

const provide = (stale: boolean) => ({
  ocOverview: { overview: ref(overviewFixture()), stale: ref(false), updatedAt: ref(null), failedAt: ref(null), attention: ref(0), refresh: vi.fn() },
  ocLive: { live: ref(liveFixture()), stale: ref(stale), refresh: vi.fn() },
})
beforeEach(() => { api.loadAttention.mockReset(); api.loadAttention.mockResolvedValue(null) })

describe('Oculus index: stale agent data (DGS-599 F1)', () => {
  it('keeps the green working dots while the live poll is fresh', async () => {
    const w = await mountSuspended(Index, { global: { provide: provide(false) } })
    await flushPromises()
    expect(w.find('#agents').findAll('.st.ok').length).toBeGreaterThan(0)
    expect(w.find('#agents .oc-banner').exists()).toBe(false)
    w.unmount()
  })
  it('stale live data: no green dot in the agents section and the stale banner above the table', async () => {
    const w = await mountSuspended(Index, { global: { provide: provide(true) } })
    await flushPromises()
    const agents = w.find('#agents')
    expect(agents.findAll('.st.ok')).toHaveLength(0)
    expect(agents.findAll('tbody tr').length).toBeGreaterThan(0)
    expect(agents.find('.oc-banner').exists()).toBe(true)
    w.unmount()
  })
})
