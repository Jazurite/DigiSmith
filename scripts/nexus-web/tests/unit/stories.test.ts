import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = join(__dirname, '../../app/components')
const NW_DIR = join(DIR, 'nw')
const stories = readdirSync(DIR).filter(f => f.endsWith('.stories.ts'))
const nwStories = readdirSync(NW_DIR).filter(f => f.endsWith('.stories.ts'))
const text = (f: string) => readFileSync(join(DIR, f), 'utf8')
const nwText = (f: string) => readFileSync(join(NW_DIR, f), 'utf8')

describe('the story catalogue', () => {
  it('has a story file for every presentational component', () => {
    for (const c of ['DashboardHeader', 'WidgetFrame', 'StatsBar', 'CalendarLegend', 'CalendarGrid', 'WeekTooltip', 'StatePanel', 'AppButton', 'GridSkeleton', 'LifeCalendarView']) {
      expect(stories, c).toContain(`${c}.stories.ts`)
    }
  })
  it('has a story file for every Nightwatch shell component', () => {
    for (const c of ['NwShell', 'NwTopBar', 'NwNav', 'NwPanel', 'NwStatus', 'NwTable']) expect(nwStories, c).toContain(`${c}.stories.ts`)
  })
  it('has a story file for every Runs, Run detail and Plan component', () => {
    for (const c of ['RunsTable', 'RunFilters', 'PipelineBar', 'EventStream', 'BudgetCard', 'RecordCard', 'OrderCard', 'PlanTasks', 'VerdictTable']) expect(nwStories, c).toContain(`${c}.stories.ts`)
  })
  it('the top bar has a story for every Nexus status', () => {
    const t = nwText('NwTopBar.stories.ts')
    for (const name of ['Healthy', 'Degraded', 'Unknown', 'BreakerOpen', 'Unreachable', 'Stale']) expect(t, name).toMatch(new RegExp(`export const ${name}\\b`))
  })
  it('the widget has one story per state, named so the ids are stable', () => {
    const t = text('LifeCalendarView.stories.ts')
    for (const name of ['Loaded', 'Loading', 'ApiError', 'KeyUnavailable', 'Empty', 'BeforeBirth', 'PastNinetyYears']) expect(t, name).toMatch(new RegExp(`export const ${name}\\b`))
  })
  it('no story fetches, and the only data source is the fake fixtures', () => {
    const all = [...stories.map(file => ({ file, source: text(file) })), ...nwStories.map(file => ({ file, source: nwText(file) }))]
    for (const { file, source } of all) {
      expect(source, file).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|https?:\/\//)
      for (const m of source.matchAll(/from '([^']+)'/g)) expect(m[1], `${file} imports ${m[1]}`).not.toMatch(/nexus-api|profile|\.private/)
    }
  })
})
