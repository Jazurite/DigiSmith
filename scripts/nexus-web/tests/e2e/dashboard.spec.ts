import { expect, test } from './fixtures'

test.describe('the dashboard against the stub API (fake profile)', () => {
  test('draws 90 rows of 52 boxes with the right states and numbers', async ({ app, page }) => {
    await page.goto(app.url)
    await expect(page.getByRole('heading', { level: 2, name: 'Life Calendar' })).toBeVisible()
    await expect(page.locator('[role="gridcell"]')).toHaveCount(4680)
    await expect(page.locator('[role="rowheader"]')).toHaveCount(90)
    await expect(page.locator('[data-state="lived"]')).toHaveCount(1913)
    await expect(page.locator('[data-state="current"]')).toHaveCount(1)
    await expect(page.locator('[data-state="ahead"]')).toHaveCount(2766)
    await expect(page.locator('dd')).toHaveText(['1,913', '2,766', '40.9%'])
    await expect(page.locator('dt')).toHaveText(['weeks lived', 'weeks left', 'lived'])
    await expect(page.getByText('Updated 21:00, UTC+7')).toBeVisible()
    await expect(page.locator('.date')).toHaveText('Today: Friday 16 October 2026')   // "Today: " is the visually hidden prefix
  })
  test('the tooltip shows age, week, dates and state on hover', async ({ app, page }) => {
    await page.goto(app.url)
    await page.locator('[data-row="36"][data-box="41"]').hover()
    const tip = page.getByRole('tooltip')
    await expect(tip).toContainText('Age 36 · Week 42 of 52')
    await expect(tip).toContainText('15 Oct 2026 – 21 Oct 2026')
    await expect(tip).toContainText('This week')
  })
  test('dark mode follows the device', async ({ app, page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto(app.url)
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(10, 10, 10)')
    await expect(page.locator('[data-state="current"]')).toHaveCSS('background-color', 'rgb(255, 90, 60)')
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  })
  test('no horizontal scroll at 320 px', async ({ app, page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await page.goto(app.url)
    await expect(page.locator('[role="gridcell"]')).toHaveCount(4680)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
  test('the page talks to the stub API only, and only for the life calendar', async ({ app, page }) => {
    const seen: string[] = []
    page.on('request', r => seen.push(r.url()))
    await page.goto(app.url)
    await expect(page.locator('[role="gridcell"]')).toHaveCount(4680)
    expect(seen.every(u => u.startsWith(app.url))).toBe(true)
    expect(seen.filter(u => u.includes('/api/')).map(u => new URL(u).pathname)).toEqual(['/api/v1/life-calendar'])
  })
  test('it asks again at the UTC+7 midnight', async ({ app, page }) => {
    let calls = 0
    page.on('request', r => { if (r.url().includes('/api/v1/life-calendar')) calls++ })
    await page.goto(app.url)
    await expect(page.locator('[role="gridcell"]')).toHaveCount(4680)
    expect(calls).toBe(1)
    await page.clock.fastForward('03:10:00')   // 21:00 + 3 h 10 min passes 00:00 in UTC+7
    await expect.poll(() => calls).toBeGreaterThanOrEqual(2)
  })
  test('before birth and past the last row use the normal layout with no this-week box', async ({ app, page }) => {
    for (const [mode, dd] of [['before', ['0', '4,680', '0.0%']], ['past', ['4,680', '0', '100.0%']]] as const) {
      await app.setMode(mode)
      await page.goto(app.url)
      await expect(page.locator('[role="gridcell"]')).toHaveCount(4680)
      await expect(page.locator('[data-state="current"]')).toHaveCount(0)
      await expect(page.locator('dd')).toHaveText([...dd])
    }
  })
})
