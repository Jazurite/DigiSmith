import { expect, test } from '@playwright/test'
import { startStubForNightwatch } from '../e2e/stub-server.ts'

// DGS-599: the side bar text starts at the 24 px page gutter (16 px nav padding + 8 px inner padding), never at the window edge.
let stub: Awaited<ReturnType<typeof startStubForNightwatch>>
test.beforeAll(async () => { stub = await startStubForNightwatch() })
test.afterAll(async () => { await stub.close() })

const PATH = '/nightwatch/'
// the left edge of the text itself, not of the box
const textLeft = (els: Element[]) => els.slice(0, 1).map((e) => { const r = document.createRange(); r.selectNodeContents(e); return Math.round(r.getBoundingClientRect().left) })[0]

// Jack's view: Chrome at 110% browser zoom in a window about 1860 px wide = 1691 CSS px at deviceScaleFactor 1.1
const cases = [
  { name: '1440-desktop', width: 1440, scale: 1 },
  { name: '1024-desktop', width: 1024, scale: 1 },
  { name: '1860-zoom110-desktop', width: 1691, scale: 1.1 },
]
for (const { name, width, scale } of cases) {
  test(`side bar text starts at 24 px: ${name}`, async ({ browser }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop project only')
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: scale })
    const page = await context.newPage()
    await page.clock.install({ time: new Date('2026-10-22T03:00:00Z') })
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.goto(`${stub.url}${PATH}`)
    await page.locator('main h1').waitFor()
    for (const sel of ['nav .brand', 'nav h2', 'nav a']) expect(await page.locator(sel).evaluateAll(textLeft), sel).toBe(24)
    await page.evaluate(() => document.fonts.ready)
    await expect(page.locator('nav').first()).toHaveScreenshot(`sidebar-edge-${name}.png`)
    await context.close()
  })
}

test('phone nav row: the first link text starts at 24 px', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phone project only')
  await page.clock.install({ time: new Date('2026-10-22T03:00:00Z') })
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.goto(`${stub.url}${PATH}`)
  await page.locator('main h1').waitFor()
  expect(await page.locator('nav a').evaluateAll(textLeft)).toBe(24)
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator('nav').first()).toHaveScreenshot('sidebar-edge-390-phone.png')
})
