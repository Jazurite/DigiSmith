import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import { overviewFixture } from '../../tests/oculus-fixtures'
import Layout from './oculus.vue'

const loadOverview = vi.hoisted(() => vi.fn())
vi.mock('../composables/oculus-api', () => ({ loadOverview }))

describe('the oculus layout', () => {
  it('feeds one fake poll to the nav badge and the top bar, and offers the skip link', async () => {
    loadOverview.mockResolvedValue(overviewFixture())
    const w = await mountSuspended(Layout, { slots: { default: '<p>page</p>' } })
    await flushPromises()
    expect(loadOverview).toHaveBeenCalledTimes(1)
    expect(w.find('.badge').text()).toBe('2')
    expect(w.text()).toContain('Nexus healthy')
    expect(w.text()).toContain('Workers 2')
    expect(w.find('a.skip').attributes('href')).toBe('#main')
    expect(w.find('main#main').text()).toContain('page')
    w.unmount()
  })
  it('shows unreachable when the first poll fails', async () => {
    loadOverview.mockRejectedValue(new Error('x'))
    const w = await mountSuspended(Layout)
    await flushPromises()
    expect(w.text()).toContain('Nexus unreachable')
    expect(w.find('.badge').exists()).toBe(false)
    w.unmount()
  })
})
