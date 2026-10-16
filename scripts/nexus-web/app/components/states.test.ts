import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { fixture } from '../../tests/fixtures'
import LifeCalendarView from './LifeCalendarView.vue'
import StatePanel from './StatePanel.vue'

describe('StatePanel', () => {
  it.each([
    ['error', 'alert', 'The calendar is not available right now.', 'Retry'],
    ['locked', 'alert', 'The calendar is locked.', 'Retry'],
    ['empty', 'status', 'No calendar yet.', 'Reload'],
  ] as const)('%s uses role %s, shows its words and a %s button', async (kind, role, title, button) => {
    const w = await mountSuspended(StatePanel, { props: { kind, retrying: false } })
    expect(w.find(`[role="${role}"]`).exists()).toBe(true)
    expect(w.text()).toContain(title)
    expect(w.find('button').text()).toBe(button)
  })
  it('never shows a code, a path or a key name', async () => {
    for (const kind of ['error', 'locked', 'empty'] as const) {
      const text = (await mountSuspended(StatePanel, { props: { kind, retrying: false } })).text()
      expect(text).not.toMatch(/key_unavailable|profile_|\/api\/|profile\.key|\.json/)
    }
  })
  it('the button says "Retrying…", is disabled while retrying, and emits retry on click', async () => {
    const w = await mountSuspended(StatePanel, { props: { kind: 'error', retrying: false } })
    await w.find('button').trigger('click')
    expect(w.emitted('retry')).toHaveLength(1)
    await w.setProps({ retrying: true })
    expect(w.find('button').text()).toBe('Retrying…')
    expect(w.find('button').attributes('disabled')).toBeUndefined()   // aria-disabled keeps the focus on the button
    expect(w.find('button').attributes('aria-disabled')).toBe('true')
    await w.find('button').trigger('click')
    expect(w.emitted('retry')).toHaveLength(1)   // a click while busy does nothing
  })
})

describe('LifeCalendarView frame', () => {
  it('keeps the title in every state and shows the matching meta', async () => {
    const cases = [
      [{ kind: 'loading' }, 'Loading your calendar…'],
      [{ kind: 'loaded', data: fixture() }, 'Updated 21:00, UTC+7'],
      [{ kind: 'error' }, 'Not available'],
    ] as const
    for (const [state, meta] of cases) {
      const w = await mountSuspended(LifeCalendarView, { props: { state, retrying: false } })
      expect(w.find('h2').text()).toBe('Life Calendar')
      expect(w.text()).toContain(meta)
    }
  })
  it('shows a panel for error, locked and empty, and none while loading or loaded', async () => {
    for (const kind of ['error', 'locked', 'empty'] as const) {
      expect((await mountSuspended(LifeCalendarView, { props: { state: { kind }, retrying: false } })).find('.panel').exists()).toBe(true)
    }
    expect((await mountSuspended(LifeCalendarView, { props: { state: { kind: 'loading' }, retrying: false } })).find('.panel').exists()).toBe(false)
    expect((await mountSuspended(LifeCalendarView, { props: { state: { kind: 'loaded', data: fixture() }, retrying: false } })).find('.panel').exists()).toBe(false)
  })
})
