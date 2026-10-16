import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = join(__dirname, '../../app/components')
const stories = readdirSync(DIR).filter(f => f.endsWith('.stories.ts'))
const text = (f: string) => readFileSync(join(DIR, f), 'utf8')

describe('the story catalogue', () => {
  it('has a story file for every presentational component', () => {
    for (const c of ['DashboardHeader', 'WidgetFrame', 'StatsBar', 'CalendarLegend', 'CalendarGrid', 'WeekTooltip', 'StatePanel', 'AppButton', 'GridSkeleton', 'LifeCalendarView']) {
      expect(stories, c).toContain(`${c}.stories.ts`)
    }
  })
  it('the widget has one story per state, named so the ids are stable', () => {
    const t = text('LifeCalendarView.stories.ts')
    for (const name of ['Loaded', 'Loading', 'ApiError', 'KeyUnavailable', 'Empty', 'BeforeBirth', 'PastNinetyYears']) expect(t, name).toMatch(new RegExp(`export const ${name}\\b`))
  })
  it('no story fetches, and the only data source is the fake fixtures', () => {
    for (const f of stories) {
      const t = text(f)
      expect(t, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|https?:\/\//)
      for (const m of t.matchAll(/from '([^']+)'/g)) expect(m[1], `${f} imports ${m[1]}`).not.toMatch(/nexus-api|profile|\.private/)
    }
  })
})
