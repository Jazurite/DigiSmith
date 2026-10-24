import { expect, test } from '@playwright/test'
import { startStubForOculus } from '../e2e/stub-server.ts'

// Row cards at the phone width: one baseline each for Operations and Runs (the phone project only).
let stub: Awaited<ReturnType<typeof startStubForOculus>>
test.beforeAll(async () => { stub = await startStubForOculus() })
test.afterAll(async () => { await stub.close() })

for (const [name, path] of [['operations', '/nightwatch/'], ['runs', '/nightwatch/runs/']] as const) {
  test(`oculus mobile ${name}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'phone width only')
    await stub.setMode('oc-ok')
    await page.clock.install({ time: new Date('2026-10-22T03:00:00Z') })
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.goto(`${stub.url}${path}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)
    await expect(page).toHaveScreenshot(`oculus-mobile-${name}-phone.png`, { fullPage: true })
  })
}
