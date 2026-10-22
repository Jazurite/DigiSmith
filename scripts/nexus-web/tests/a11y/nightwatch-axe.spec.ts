// scripts/nexus-web/tests/a11y/nightwatch-axe.spec.ts
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { startStubForNightwatch } from '../e2e/stub-server.ts'

let stub: Awaited<ReturnType<typeof startStubForNightwatch>>
test.beforeAll(async () => { stub = await startStubForNightwatch() })
test.afterAll(async () => { await stub.close() })

const PAGES = ['/nightwatch/', '/nightwatch/attention/', '/nightwatch/runs/', '/nightwatch/run/?id=builder-20261022T021000-a1b2c3', '/nightwatch/plan/?ticket=DGS-590']
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']
for (const scheme of ['light', 'dark'] as const) {
  for (const path of PAGES) {
    test(`axe: ${path} ${scheme}`, async ({ page }) => {
      await stub.setMode('nw-ok')
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await page.goto(`${stub.url}${path}`)
      await page.locator('main h1').waitFor()
      await expect(page.getByRole('group', { name: 'Nexus status' }).getByRole('status')).toContainText('Nexus healthy')
      const r = await new AxeBuilder({ page }).withTags(TAGS).analyze()
      expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
    })
  }
  // the top bar in the states that are not green: unknown, and stale (amber) after a failed poll
  test(`axe: top bar unknown ${scheme}`, async ({ page }) => {
    await stub.setMode('nw-unknown')
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.goto(`${stub.url}/nightwatch/`)
    await expect(page.getByRole('group', { name: 'Nexus status' }).getByRole('status')).toContainText('Nexus unknown')
    const r = await new AxeBuilder({ page }).withTags(TAGS).analyze()
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
  })
  test(`axe: top bar stale ${scheme}`, async ({ page }) => {
    await stub.setMode('nw-ok')
    await page.clock.install({ time: new Date('2026-10-22T03:00:00Z') })
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.goto(`${stub.url}/nightwatch/`)
    await expect(page.getByRole('group', { name: 'Nexus status' }).getByRole('status')).toContainText('Nexus healthy')
    await stub.setMode('nw-down')
    await page.clock.fastForward(10_500)
    await expect(page.getByRole('group', { name: 'Nexus status' }).getByRole('status')).toContainText('Nexus stale')
    const r = await new AxeBuilder({ page }).withTags(TAGS).analyze()
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
  })
}
