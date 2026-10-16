import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '../e2e/fixtures'
import { holdScheduler } from '../e2e/hold-scheduler'

// axe on the PENDING grid: the scheduler is held, so 11 of 91 rows are drawn and the spacer stands in for the rest.
for (const scheme of ['light', 'dark'] as const) {
  test(`no axe violations while the grid is pending, ${scheme}`, async ({ app, page }) => {
    test.setTimeout(120_000)
    await page.emulateMedia({ colorScheme: scheme })
    await holdScheduler(page)
    await page.goto(app.url)
    const grid = page.locator('#calendar-grid')
    await expect(grid).toHaveAttribute('data-rendered', 'pending')
    await expect(grid).toHaveAttribute('role', 'grid')
    await expect(grid).toHaveAttribute('tabindex', '0')
    await expect(grid).toHaveAttribute('aria-rowcount', '91')
    expect(await grid.locator('[role="row"]').count()).toBe(11)   // the ruler row and 10 data rows
    await expect(grid.locator('.pending')).toHaveAttribute('aria-hidden', 'true')
    const all = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).disableRules(['target-size']).analyze()
    const size = await new AxeBuilder({ page }).withRules(['target-size']).exclude('#calendar-grid [role="gridcell"]').analyze()
    expect([...all.violations, ...size.violations].map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
  })
}
