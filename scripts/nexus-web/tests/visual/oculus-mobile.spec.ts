import { expect, test } from '@playwright/test'
import { freezeClock } from '../e2e/freeze-clock.ts'
import { startStubForOculus } from '../e2e/stub-server.ts'

// Row cards at the phone width: one baseline each for the index, the index with herdr down (DGS-599), Runs and a run page with the tokens card (DGS-590) (the phone project only).
let stub: Awaited<ReturnType<typeof startStubForOculus>>
test.beforeAll(async () => { stub = await startStubForOculus() })
test.afterAll(async () => { await stub.close() })

for (const [name, path, mode] of [['index', '/', 'oc-ok'], ['index-disconnected', '/', 'oc-herdr-down'], ['runs', '/runs/', 'oc-ok'], ['run', '/run/?id=builder-20261022T021000-a1b2c3', 'oc-ok']] as const) {
  test(`oculus mobile ${name}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'phone width only')
    await stub.setMode(mode)
    await freezeClock(page, '2026-10-22T03:00:00Z')
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.goto(`${stub.url}${path}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)
    await expect(page).toHaveScreenshot(`oculus-mobile-${name}-phone.png`, { fullPage: true })
  })
}
