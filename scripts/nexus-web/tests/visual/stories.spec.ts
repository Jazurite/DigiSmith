import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { startStatic } from '../a11y/static-server.ts'

const DIR = join(import.meta.dirname, '../../storybook-static')
const entries = Object.values(JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8')).entries as Record<string, { id: string; type: string }>).filter(e => e.type === 'story')
let url = ''; let close: () => Promise<void>
test.beforeAll(async () => { ({ url, close } = await startStatic(DIR)) })
test.afterAll(async () => { await close() })

for (const scheme of ['light', 'dark'] as const) {
  for (const e of entries) {
    test(`${e.id} ${scheme}`, async ({ page }, info) => {
      // The seven widget states are checked at both widths. Every other story at the desktop width only.
      test.skip(info.project.name === 'phone' && !e.id.startsWith('widget-life-calendar--'), 'phone width: widget states only')
      // fixed clock: the header date is stable. The Nightwatch fixtures are dated 2026-10-22, so their stories use a clock a few minutes after the fixture times (ages such as "stale 5m" read right).
      await page.clock.install({ time: new Date(e.id.startsWith('nightwatch-') ? '2026-10-22T03:45:00Z' : '2026-10-16T14:00:00Z') })
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await page.goto(`${url}/iframe.html?id=${e.id}&viewMode=story`)
      await page.locator('#storybook-root > *').first().waitFor()
      await page.waitForFunction(() => !document.querySelector('[data-rendered="pending"]'))   // the grid draws its rows in chunks
      await page.evaluate(() => document.fonts.ready)
      await expect(page).toHaveScreenshot(`${e.id}-${scheme}-${info.project.name}.png`, { fullPage: true })
    })
  }
}
