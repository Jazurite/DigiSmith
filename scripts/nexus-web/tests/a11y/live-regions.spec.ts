import { expect, test } from '../e2e/fixtures'

// Carried-over accessibility items: persistent live regions, aria-disabled Retry, no double reading.
test('one persistent status region announces loading, then the loaded totals (the same element)', async ({ app, page }) => {
  await page.goto(app.url)
  const live = page.getByTestId('calendar-live')
  await expect(live).toHaveCount(1)
  await expect(page.locator('[role="gridcell"]')).toHaveCount(4680)
  await expect(live).toHaveText('Calendar loaded. 1,913 weeks lived, 2,766 weeks left, 40.9% lived.')
  await expect(live).toHaveCount(1)
  await expect(page.locator('[aria-live]:not([data-testid])')).toHaveCount(0)   // no second, throw-away region in the stats
})

test('the live region element is not replaced when the data arrives', async ({ app, page }) => {
  await page.route('**/api/v1/life-calendar*', async (route) => { await new Promise(r => setTimeout(r, 400)); await route.continue() })
  await page.addInitScript(() => {
    window.addEventListener('DOMContentLoaded', () => {
      const w = window as unknown as { __live?: Element | null }
      const tick = () => { const el = document.querySelector('[data-testid="calendar-live"]'); if (el && !w.__live) w.__live = el; requestAnimationFrame(tick) }
      tick()
    })
  })
  await page.goto(app.url)
  await expect(page.locator('[role="gridcell"]')).toHaveCount(4680)
  expect(await page.evaluate(() => (window as unknown as { __live?: Element }).__live === document.querySelector('[data-testid="calendar-live"]'))).toBe(true)
})

test('Retry keeps keyboard focus while it is busy (aria-disabled, not disabled) and ignores a second activation', async ({ app, page }) => {
  await app.setMode('down')
  await page.goto(app.url)
  const btn = page.getByRole('button', { name: 'Retry' })
  await expect(btn).toBeVisible()
  let hits = 0
  await page.route('**/api/v1/life-calendar*', async (route) => { hits++; await new Promise(r => setTimeout(r, 600)); await route.continue() })
  await btn.focus()
  await page.keyboard.press('Enter')
  const busy = page.getByRole('button', { name: 'Retrying…' })
  await expect(busy).toHaveAttribute('aria-disabled', 'true')
  await expect(busy).not.toHaveAttribute('disabled', /.*/)
  await expect(busy).toBeFocused()
  await page.keyboard.press('Enter')   // a second activation while busy does nothing
  await expect(page.getByRole('button', { name: 'Retry' })).toBeFocused()
  expect(hits).toBe(1)
})

test('keyboard focus: the box is read by its aria-label only (no aria-describedby duplicate), tooltip stays dismissible', async ({ app, page }) => {
  await page.goto(app.url)
  const box = page.locator('[data-row="36"][data-box="41"]')
  await box.focus()
  await expect(page.getByRole('tooltip')).toBeVisible()
  await expect(box).not.toHaveAttribute('aria-describedby', /.*/)
  await expect(page.getByTestId('grid-live')).toHaveText('')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tooltip')).toHaveCount(0)
})

test.describe('touch', () => {
  test.skip(({ isMobile }) => !isMobile, 'touch runs on the phone project')
  test('a touch readout is announced by the one grid live region, whose text changes', async ({ app, page }) => {
    await page.goto(app.url)
    const live = page.getByTestId('grid-live')
    await expect(live).toHaveText('')
    const box = await page.locator('[data-row="36"][data-box="41"]').boundingBox()
    await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await expect(live).toContainText('Age 36, week 42 of 52')
    await expect(live).toContainText('this week')
    await expect(page.getByTestId('grid-live')).toHaveCount(1)
    await page.touchscreen.tap(5, 5)
    await expect(live).toHaveText('')
  })
})
