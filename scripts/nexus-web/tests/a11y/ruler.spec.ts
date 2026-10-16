import { expect, test } from '../e2e/fixtures'

// The ruler labels ("Week 1", "Week 13", ...) must not be clipped at any phone width, and the page must not scroll sideways.
for (const width of [320, 360, 375, 390]) {
  test(`ruler marks are not clipped and the page does not scroll sideways at ${width}px`, async ({ app, page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto(app.url)
    await expect(page.locator('[role="gridcell"]')).toHaveCount(4680)
    const marks = await page.locator('#calendar-grid .mark').evaluateAll(els => els.map(e => ({ text: e.textContent, sw: e.scrollWidth, cw: e.clientWidth })))
    expect(marks).toHaveLength(5)
    for (const m of marks) expect(m.sw, `${m.text}: scrollWidth ${m.sw} > clientWidth ${m.cw}`).toBeLessThanOrEqual(m.cw)
    const page_ = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
    expect(page_.sw).toBeLessThanOrEqual(page_.cw)
  })
}
