import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from '../e2e/fixtures'

// axe walks 4,680 boxes: about 30 s per run on the Workbox, so these tests get a longer timeout than the 30 s default
const AXE_TIMEOUT = 180_000
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

// Everything, with ONE exception recorded in EXCEPTIONS.md: target size on the grid boxes (run separately, below).
async function violations(page: Page) {
  const all = await new AxeBuilder({ page }).withTags(TAGS).disableRules(['target-size']).analyze()
  const size = await new AxeBuilder({ page }).withRules(['target-size']).exclude('#calendar-grid [role="gridcell"]').analyze()
  return [...all.violations, ...size.violations].map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)
}

for (const scheme of ['light', 'dark'] as const) {
  for (const mode of ['ok', 'before', 'past', 'locked', 'empty', 'down'] as const) {
    test(`no axe violations: ${mode}, ${scheme}`, async ({ app, page }) => {
      test.setTimeout(AXE_TIMEOUT)
      await app.setMode(mode)
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto(app.url)
      if (mode === 'locked' || mode === 'empty' || mode === 'down') await expect(page.locator('.panel')).toBeVisible()
      else await expect(page.locator('[role="gridcell"]')).toHaveCount(4680)
      expect(await violations(page)).toEqual([])
    })
  }
  test(`no axe violations with the tooltip open (keyboard), ${scheme}`, async ({ app, page }) => {
    test.setTimeout(AXE_TIMEOUT)
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto(app.url)
    await page.locator('[data-row="36"][data-box="41"]').focus()
    await expect(page.getByRole('tooltip')).toBeVisible()
    expect(await violations(page)).toEqual([])
  })
}
