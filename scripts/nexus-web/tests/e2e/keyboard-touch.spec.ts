import { expect, test } from './fixtures'

test.describe('keyboard', () => {
  test.skip(({ isMobile }) => isMobile, 'keyboard runs on the desktop project')
  test('Tab reaches the skip link, then the one grid tab stop on this week', async ({ app, page }) => {
    await page.goto(app.url)
    await expect(page.locator('[data-row="36"][data-box="41"]')).toBeAttached()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to the calendar' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.locator('[data-row="36"][data-box="41"]')).toBeFocused()
    await expect(page.getByRole('tooltip')).toContainText('Age 36 · Week 42 of 52')
  })
  test('the Designer keys move focus, and the tooltip follows', async ({ app, page }) => {
    await page.goto(app.url)
    await page.locator('[data-row="36"][data-box="41"]').focus()
    const at = (r: number, b: number) => expect(page.locator(`[data-row="${r}"][data-box="${b}"]`)).toBeFocused()
    await page.keyboard.press('ArrowRight'); await at(36, 42)
    await page.keyboard.press('ArrowDown'); await at(37, 42)
    await page.keyboard.press('Home'); await at(37, 0)
    await page.keyboard.press('End'); await at(37, 51)
    await page.keyboard.press('PageUp'); await at(27, 51)
    await page.keyboard.press('Control+Home'); await at(0, 0)
    await page.keyboard.press('Control+End'); await at(89, 51)
    await expect(page.getByRole('tooltip')).toContainText('Age 89 · Week 52 of 52')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('tooltip')).toHaveCount(0)
    expect(await page.locator('[role="gridcell"][tabindex="0"]').count()).toBe(1)
  })
  test('hover with a mouse shows the tooltip for the box under the pointer', async ({ app, page }) => {
    await page.goto(app.url)
    await page.locator('[data-row="10"][data-box="5"]').hover()
    await expect(page.getByRole('tooltip')).toContainText('Age 10 · Week 6 of 52')
  })
})

test.describe('touch', () => {
  test.skip(({ isMobile }) => !isMobile, 'touch runs on the phone project')
  test('a tap near a box selects the nearest box and shows the readout at the bottom', async ({ app, page }) => {
    await page.goto(app.url)
    const box = await page.locator('[data-row="36"][data-box="41"]').boundingBox()
    await page.touchscreen.tap(box!.x + box!.width / 2 + 2, box!.y + box!.height / 2 + 2)   // beside the box (the boxes are 6.4 px apart on a phone), inside the 14 px radius
    const readout = page.getByRole('status').filter({ hasText: 'Age 36' })
    await expect(readout).toContainText('Week 42 of 52')
    const r = await readout.boundingBox()
    expect(r!.y + r!.height).toBeGreaterThan(844 - 40)   // pinned to the bottom of the screen
    await page.touchscreen.tap(5, 5)   // outside the grid clears it
    await expect(readout).toHaveCount(0)
  })
})
