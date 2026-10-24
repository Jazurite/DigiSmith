import { expect, test } from '@playwright/test'
import { startStubForOculus } from '../e2e/stub-server.ts'

// DGS-599: the side bar text starts at the 24 px page gutter (16 px nav padding + 8 px inner padding), never at the window edge.
let stub: Awaited<ReturnType<typeof startStubForOculus>>
test.beforeAll(async () => { stub = await startStubForOculus() })
test.afterAll(async () => { await stub.close() })

const PATH = '/nightwatch/'
// the left edge of the text itself, not of the box, for every shown element
const textLefts = (els: Element[]) => els.filter((e) => e.getClientRects().length > 0).map((e) => { const r = document.createRange(); r.selectNodeContents(e); return Math.round(r.getBoundingClientRect().left) })
const expectAt24 = (lefts: number[], sel: string) => {
  expect(lefts.length, sel).toBeGreaterThan(0)
  for (const left of lefts) expect(left, sel).toBe(24)
}

// Jack's view: Chrome at 110% browser zoom in a window about 1860 px wide = 1691 CSS px at deviceScaleFactor 1.1.
// The nav is a fixed 200 px wide, so 1024 gets the position check only (its image equals 1440's);
// the zoom case shoots at device scale, so its image differs from the 1440 one.
const cases = [
  { name: '1440-desktop', width: 1440, scale: 1, shot: 'css' },
  { name: '1024-desktop', width: 1024, scale: 1, shot: null },
  { name: '1860-zoom110-desktop', width: 1691, scale: 1.1, shot: 'device' },
] as const
for (const { name, width, scale, shot } of cases) {
  test(`side bar text starts at 24 px: ${name}`, async ({ browser }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop project only')
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: scale })
    const page = await context.newPage()
    await page.clock.install({ time: new Date('2026-10-22T03:00:00Z') })
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.goto(`${stub.url}${PATH}`)
    await page.locator('main h1').waitFor()
    for (const sel of ['nav .brand', 'nav h2', 'nav a']) expectAt24(await page.locator(sel).evaluateAll(textLefts), sel)
    if (shot) {
      await page.evaluate(() => document.fonts.ready)
      await expect(page.locator('nav').first()).toHaveScreenshot(`sidebar-edge-${name}.png`, { scale: shot })
    }
    await context.close()
  })
}

test('phone nav row: the first link text starts at 24 px', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phone project only')
  await page.clock.install({ time: new Date('2026-10-22T03:00:00Z') })
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.goto(`${stub.url}${PATH}`)
  await page.locator('main h1').waitFor()
  expect(await page.locator('nav a').first().evaluate((e) => { const r = document.createRange(); r.selectNodeContents(e); return Math.round(r.getBoundingClientRect().left) })).toBe(24)
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator('nav').first()).toHaveScreenshot('sidebar-edge-390-phone.png')
})
