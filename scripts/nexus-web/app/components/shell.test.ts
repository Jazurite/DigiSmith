import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import DashboardHeader from './DashboardHeader.vue'
import WidgetFrame from './WidgetFrame.vue'

describe('shell components', () => {
  it('the header has the wordmark and a date slot of fixed size', async () => {
    const w = await mountSuspended(DashboardHeader)
    expect(w.find('header').exists()).toBe(true)
    expect(w.text()).toContain('pazurite')
    expect(w.find('.date').exists()).toBe(true)
    expect(w.find('.date').attributes('aria-label')).toBeUndefined()   // aria-label on a plain span is prohibited
    expect(w.find('.date .sr-only').text()).toBe('Today:')
  })
  it('the widget frame renders an h2, the meta, the content and the note', async () => {
    const w = await mountSuspended(WidgetFrame, { props: { title: 'Life Calendar', meta: 'Updated 21:00, UTC+7' }, slots: { default: '<p id="c">content</p>', note: 'a note' } })
    expect(w.find('section').attributes('aria-labelledby')).toBeTruthy()
    expect(w.find('h2').text()).toBe('Life Calendar')
    expect(w.text()).toContain('Updated 21:00, UTC+7')
    expect(w.find('#c').exists()).toBe(true)
    expect(w.text()).toContain('a note')
  })
})
