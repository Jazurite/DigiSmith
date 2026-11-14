// scripts/nexus-web/tests/unit/voiceover-checklist.test.ts
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '../..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const CHECKLIST = 'tests/a11y/voiceover-checklist.md'
// a lived percentage is private; a plain '200%' (zoom) is fine
const PERCENT_LIVED = /\d+(\.\d+)?\s*%\s*(lived|of life)/i

describe('the VoiceOver checklist', () => {
  it('exists with its three parts and the sign-off line', () => {
    expect(existsSync(join(ROOT, CHECKLIST))).toBe(true)
    const t = read(CHECKLIST)
    expect(t).toContain('## Part A: Mac')
    expect(t).toContain('## Part B: iPhone')
    expect(t).toContain('## Part C: the two recorded exceptions')
    expect(t).toMatch(/^Sign-off: _+ \(name, date\)$/m)
  })

  it('has 11, 5 and 2 tick lines in Parts A, B and C', () => {
    const t = read(CHECKLIST)
    const part = (from: string, to?: string) => {
      const a = t.indexOf(from)
      const b = to ? t.indexOf(to) : t.length
      return t.slice(a, b).split('\n').filter(l => l.startsWith('- [ ] ')).length
    }
    expect(part('## Part A: Mac', '## Part B: iPhone')).toBe(11)
    expect(part('## Part B: iPhone', '## Part C')).toBe(5)
    expect(part('## Part C')).toBe(2)
  })

  // every string the checklist quotes must still be what the code says
  it.each([
    ['Skip to the calendar', 'app/pages/index.vue'],
    ['Use the arrow keys to move between weeks', 'app/components/CalendarGrid.vue'],
    ['Calendar loaded.', 'app/components/LifeCalendarView.vue'],
    ['Retrying…', 'app/components/StatePanel.vue'],
    ["role: 'alert'", 'app/components/StatePanel.vue'],
    ['week ${b + 1} of ${BOXES}', 'app/utils/grid-label.ts'],
    ["current: 'this week'", 'app/utils/grid-label.ts'],
    ['weeks lived', 'app/components/StatsBar.vue'],
    ['weeks left', 'app/components/StatsBar.vue'],
  ])('quotes "%s", which is still in %s', (text, file) => {
    expect(read(file)).toContain(text)
    // the checklist quotes the human text, not the code form
    const human = text.replace('week ${b + 1} of ${BOXES}', 'week W of 52').replace("current: 'this week'", 'this week').replace("role: 'alert'", 'alert').replace('Use the arrow keys to move between weeks', 'use the arrow keys')
    expect(read(CHECKLIST)).toContain(human)
  })

  it('does not describe the box by the tooltip (so the checklist line "not read twice" stays true)', () => {
    for (const f of ['GridRows', 'CalendarGrid', 'WeekTooltip']) {
      expect(read(`app/components/${f}.vue`)).not.toContain('aria-describedby')
    }
  })

  it('names both exceptions of EXCEPTIONS.md', () => {
    const ex = read('tests/a11y/EXCEPTIONS.md')
    const t = read(CHECKLIST)
    for (const wcag of ['2.5.8', '1.4.13']) {
      expect(ex).toContain(wcag)
      expect(t).toContain(wcag)
    }
  })

  it('holds no private data', () => {
    const t = read(CHECKLIST)
    expect(t).not.toMatch(/\b(19|20)\d\d-\d\d-\d\d\b/)
    expect(t.toLowerCase()).not.toContain('born')
    expect(t.toLowerCase()).not.toMatch(/life (length|of) \d+/)
    expect(t.toLowerCase()).not.toMatch(/life \d+/)
    expect(t).not.toMatch(/\bAge \d/)
    expect(t).not.toMatch(/\d{1,3}(,\d{3})+/)
    expect(t.toLowerCase()).not.toMatch(/\d[\d,.]* weeks (lived|left)/)
    expect(t).not.toMatch(PERCENT_LIVED)
  })

  it('the percent check hits a lived percentage but not a plain one', () => {
    expect('200%').not.toMatch(PERCENT_LIVED)
    expect('52.3% lived').toMatch(PERCENT_LIVED)
  })
})
