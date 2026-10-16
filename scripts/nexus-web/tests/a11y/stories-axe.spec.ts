import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { startStatic } from './static-server.ts'

const DIR = join(import.meta.dirname, '../../storybook-static')
const entries = Object.values(JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8')).entries as Record<string, { id: string; type: string }>).filter(e => e.type === 'story')
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

// The Storybook a11y addon runs axe in the story frame by itself after the render; the big grids keep it busy for seconds.
// axe allows one run at a time, so wait for the addon's run instead of failing on "Axe is already running".
async function analyzeWhenFree<T>(run: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await run() } catch (e) { if (i > 60 || !String(e).includes('already running')) throw e }
    await new Promise(r => setTimeout(r, 2000))
  }
}

let url = ''; let close: () => Promise<void>
test.beforeAll(async () => { ({ url, close } = await startStatic(DIR)) })
test.afterAll(async () => { await close() })

for (const scheme of ['light', 'dark'] as const) {
  for (const e of entries) {
    test(`axe: ${e.id}, ${scheme}`, async ({ page }) => {
      test.setTimeout(180_000)   // the full-size grid stories hold 4,680 boxes
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto(`${url}/iframe.html?id=${e.id}&viewMode=story`)
      await page.locator('#storybook-root > *').first().waitFor()
      // target-size on the grid boxes is the one recorded exception (tests/a11y/EXCEPTIONS.md)
      const all = await analyzeWhenFree(() => new AxeBuilder({ page }).include('#storybook-root').withTags(TAGS).disableRules(['target-size', 'region']).analyze())
      const size = await analyzeWhenFree(() => new AxeBuilder({ page }).include('#storybook-root').withRules(['target-size']).exclude('[role="gridcell"]').analyze())
      expect([...all.violations, ...size.violations].map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
    })
  }
}
