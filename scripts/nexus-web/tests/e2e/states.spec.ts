import { expect, test } from './fixtures'

test.describe('error states', () => {
  for (const [mode, role, title] of [['locked', 'alert', 'The calendar is locked.'], ['empty', 'status', 'No calendar yet.'], ['down', 'alert', 'The calendar is not available right now.']] as const) {
    test(`${mode}: a panel over the ghost grid, dashes in the stats, the frame stays`, async ({ app, page }) => {
      await app.setMode(mode)
      await page.goto(app.url)
      const panel = page.locator('.panel')
      await expect(panel).toBeVisible()
      await expect(panel).toHaveAttribute('role', role)
      await expect(panel).toContainText(title)
      await expect(page.locator('dd')).toHaveText(['–', '–', '–'])
      await expect(page.getByRole('heading', { level: 2, name: 'Life Calendar' })).toBeVisible()
      await expect(page.locator('[role="gridcell"]')).toHaveCount(0)
    })
  }
  test('Retry recovers when the server recovers, and moves focus to the grid', async ({ app, page }) => {
    await app.setMode('locked')
    await page.goto(app.url)
    await expect(page.locator('.panel')).toBeVisible()
    await app.setMode('ok')
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(page.locator('[role="gridcell"]')).toHaveCount(4680)
    await expect(page.locator('.panel')).toHaveCount(0)
    await expect(page.locator('[data-row="36"][data-box="41"]')).toBeFocused()
  })
  test('Retry keeps the panel when it fails again', async ({ app, page }) => {
    await app.setMode('down')
    await page.goto(app.url)
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(page.locator('.panel')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry' })).toBeEnabled()
  })
})
