import { expect, test } from './fixtures'
import { holdScheduler } from './hold-scheduler'

// While the grid is still drawing its rows in idle chunks, there must be exactly one tab stop (the grid itself OR one box), never none and never two.
const stops = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const g = document.getElementById('calendar-grid')!
  return [g, ...g.querySelectorAll('[role="gridcell"]')].filter(e => e.getAttribute('tabindex') === '0').length
})

test.describe('the single tab stop while rows are pending', () => {
  test.skip(({ isMobile }) => isMobile, 'keyboard and mouse: desktop project')
  test('a click on a drawn box while pending leaves exactly one tab stop once the grid is complete', async ({ app, page }) => {
    const hold = await holdScheduler(page)
    await page.goto(app.url)
    const grid = page.locator('#calendar-grid')
    await expect(grid).toHaveAttribute('data-rendered', 'pending')
    await expect(page.locator('[role="gridcell"]')).toHaveCount(520)   // 10 rows of 52
    expect(await stops(page)).toBe(1)   // the grid itself: this week (row 36) is not drawn yet
    await page.locator('[data-row="3"][data-box="5"]').click()
    expect(await stops(page)).toBe(1)
    await expect(grid).not.toHaveAttribute('tabindex', '0')
    await hold.release()
    await expect(grid).toHaveAttribute('data-rendered', 'complete')
    expect(await stops(page)).toBe(1)
    await expect(page.locator('[data-row="3"][data-box="5"]')).toHaveAttribute('tabindex', '0')
    await expect(page.locator('[data-row="36"][data-box="41"]')).toHaveAttribute('tabindex', '-1')
  })
  test('before birth: Ctrl+End while pending lands on the last row and leaves one tab stop', async ({ app, page }) => {
    await app.setMode('before')
    const hold = await holdScheduler(page)
    await page.goto(app.url)
    const grid = page.locator('#calendar-grid')
    await expect(grid).toHaveAttribute('data-rendered', 'pending')
    await page.locator('[data-row="0"][data-box="0"]').focus()
    await page.keyboard.press('Control+End')
    await expect(page.locator('[data-row="89"][data-box="51"]')).toBeFocused()
    await hold.release()
    await expect(grid).toHaveAttribute('data-rendered', 'complete')
    expect(await stops(page)).toBe(1)
    await expect(page.locator('[data-row="89"][data-box="51"]')).toHaveAttribute('tabindex', '0')
  })
})
