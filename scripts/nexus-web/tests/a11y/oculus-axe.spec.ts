// scripts/nexus-web/tests/a11y/oculus-axe.spec.ts
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { freezeClock } from '../e2e/freeze-clock.ts'
import { startStubForOculus } from '../e2e/stub-server.ts'

let stub: Awaited<ReturnType<typeof startStubForOculus>>
test.beforeAll(async () => { stub = await startStubForOculus() })
test.afterAll(async () => { await stub.close() })

const PAGES = ['/', '/attention/', '/runs/', '/run/?id=builder-20261022T021000-a1b2c3', '/plan/?ticket=DGS-590']
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']
for (const scheme of ['light', 'dark'] as const) {
  for (const path of PAGES) {
    test(`axe: ${path} ${scheme}`, async ({ page }) => {
      await stub.setMode('oc-ok')
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await page.goto(`${stub.url}${path}`)
      await page.locator('main h1').waitFor()
      await expect(page.getByRole('group', { name: 'Nexus status' }).getByRole('status')).toContainText('Nexus healthy')
      const r = await new AxeBuilder({ page }).withTags(TAGS).analyze()
      expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
    })
  }
  // DGS-599: herdr down, the last agent list with the banner and the neutral dots
  test(`axe: / disconnected ${scheme}`, async ({ page }) => {
    await stub.setMode('oc-herdr-down')
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.goto(`${stub.url}/`)
    await expect(page.getByText(/Disconnected from herdr, as of/)).toBeVisible()
    await expect(page.locator('#agents tbody tr')).toHaveCount(7)
    const r = await new AxeBuilder({ page }).withTags(TAGS).analyze()
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
  })
  // the top bar in the states that are not green: unknown, and stale (amber) after a failed poll
  test(`axe: top bar unknown ${scheme}`, async ({ page }) => {
    await stub.setMode('oc-unknown')
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.goto(`${stub.url}/`)
    await expect(page.getByRole('group', { name: 'Nexus status' }).getByRole('status')).toContainText('Nexus unknown')
    const r = await new AxeBuilder({ page }).withTags(TAGS).analyze()
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
  })
  test(`axe: top bar stale ${scheme}`, async ({ page }) => {
    await stub.setMode('oc-ok')
    await page.clock.install({ time: new Date('2026-10-22T03:00:00Z') })
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.goto(`${stub.url}/`)
    await expect(page.getByRole('group', { name: 'Nexus status' }).getByRole('status')).toContainText('Nexus healthy')
    await stub.setMode('oc-down')
    await page.clock.fastForward(10_500)
    await expect(page.getByRole('group', { name: 'Nexus status' }).getByRole('status')).toContainText('Nexus stale')
    const r = await new AxeBuilder({ page }).withTags(TAGS).analyze()
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
  })
}

// DGS-613: times read in words
test('the Duration cell and the strip read times in words', async ({ page }) => {
  await stub.setMode('oc-ok')
  await freezeClock(page, '2026-10-22T03:00:00Z')
  await page.goto(`${stub.url}/runs/`)
  const cell = page.locator('tbody tr').first().getByRole('cell').filter({ has: page.locator('.sr') }).first()
  await expect(cell.locator('.sr')).toHaveText('50 min, building for 14 min')
  await page.goto(`${stub.url}/run/?id=builder-20261022T021000-a1b2c3`)
  const strip = page.getByRole('list', { name: /pipeline/i })
  await expect(strip.locator('li').nth(2).locator('.sr')).toHaveText('(current, 50 min so far)')
  await expect(strip.locator('li').nth(0).locator('.sr')).toHaveText('(done, 1 min)')
})
