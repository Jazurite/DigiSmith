import { expect, test } from '@playwright/test'
import { startStubForNightwatch } from '../e2e/stub-server.ts'

// Row cards at the phone width: one baseline each for Operations and Runs (the phone project only).
let stub: Awaited<ReturnType<typeof startStubForNightwatch>>
test.beforeAll(async () => { stub = await startStubForNightwatch() })
test.afterAll(async () => { await stub.close() })

for (const [name, path] of [['operations', '/nightwatch/'], ['runs', '/nightwatch/runs/']] as const) {
  test(`nightwatch mobile ${name}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'phone width only')
    await stub.setMode('nw-ok')
    await page.clock.install({ time: new Date('2026-10-22T03:00:00Z') })
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.goto(`${stub.url}${path}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)
    await expect(page).toHaveScreenshot(`nightwatch-mobile-${name}-phone.png`, { fullPage: true })
  })
}
