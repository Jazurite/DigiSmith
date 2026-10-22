// scripts/nexus-web/tests/e2e/nightwatch.spec.ts
import { expect, test } from '@playwright/test'
import { startStubForNightwatch } from './stub-server.ts'

let stub: Awaited<ReturnType<typeof startStubForNightwatch>>
test.beforeAll(async () => { stub = await startStubForNightwatch() })
test.afterAll(async () => { await stub.close() })
test.beforeEach(async ({ page }) => { await stub.setMode('nw-ok'); await page.clock.install({ time: new Date('2026-10-22T03:00:00Z') }) })

const topBar = (page: import('@playwright/test').Page) => page.getByRole('group', { name: 'Nexus status' })

test('Operations shows the top bar, the phase table with its limits and the workers', async ({ page }) => {
  await page.goto(`${stub.url}/nightwatch/`)
  await expect(page.getByRole('heading', { name: 'Operations' })).toBeVisible()
  await expect(topBar(page).getByRole('status')).toContainText('Nexus healthy')
  await expect(page.getByText('one claimed ticket at a time (scan lock)')).toBeVisible()
  await expect(page.getByText('window: 7 days')).toBeVisible()
  await expect(page.getByRole('link', { name: /DGS-590/ }).first()).toBeVisible()
})

test('the top bar says unknown, never healthy, when the scheduler jobs never ran', async ({ page }) => {
  await stub.setMode('nw-unknown')
  await page.goto(`${stub.url}/nightwatch/`)
  await expect(topBar(page).getByRole('status')).toContainText('Nexus unknown')
  await expect(topBar(page)).not.toContainText('healthy')
})

test('a failed poll turns the top bar stale (amber) and never keeps the old healthy look', async ({ page }) => {
  await page.goto(`${stub.url}/nightwatch/`)
  await expect(topBar(page).getByRole('status')).toContainText('Nexus healthy')
  await stub.setMode('nw-down')
  await page.clock.fastForward(10_500)
  await expect(topBar(page).getByRole('status')).toContainText('Nexus stale')
  await expect(topBar(page)).not.toContainText('healthy')
  await expect(page.getByText('The last update failed.')).toBeVisible()
})

test('the nav reaches every page and marks the current one', async ({ page }) => {
  await page.goto(`${stub.url}/nightwatch/`)
  for (const [name, heading] of [['Attention', 'Attention'], ['Runs', 'Runs'], ['Plan', 'Plan']] as const) {
    await page.getByRole('navigation', { name: 'Nightwatch' }).getByRole('link', { name: new RegExp(name) }).click()
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Nightwatch' }).locator('[aria-current="page"]')).toContainText(name)
  }
})

test('Runs filters go in the URL and narrow the rows', async ({ page }) => {
  await page.goto(`${stub.url}/nightwatch/runs/`)
  const rows = page.locator('tbody tr')
  await expect(rows.first()).toBeVisible()
  const before = await rows.count()
  await page.getByLabel('Role').selectOption('reviewer')
  await expect(page).toHaveURL(/role=reviewer/)
  await expect(rows).toHaveCount(1)
  expect(await rows.count()).toBeLessThan(before)
})

test('Run detail: pipeline, event filter, tail and the read-only order', async ({ page }) => {
  await page.goto(`${stub.url}/nightwatch/run/?id=builder-20261022T021000-a1b2c3`)
  await expect(page.getByRole('list', { name: /pipeline/i }).locator('li')).toHaveCount(6)
  await page.getByRole('button', { name: 'Errors' }).click()
  await expect(page.getByRole('button', { name: 'Errors' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: /Tail: on/ }).click()
  await expect(page.getByRole('button', { name: /Tail: off/ })).toBeVisible()
  await expect(page.getByText('Build DGS-590 on the example branch.')).toBeVisible()
})

test('an unknown run says so', async ({ page }) => {
  await page.goto(`${stub.url}/nightwatch/run/?id=nope-1`)
  await expect(page.getByText('This run does not exist.')).toBeVisible()
})

test('Plan shows task n of m and the verdicts', async ({ page }) => {
  await page.goto(`${stub.url}/nightwatch/plan/?ticket=DGS-590`)
  await expect(page.getByText(/Task \d+ of \d+/)).toBeVisible()
  await expect(page.getByText('Missing null check')).toBeVisible()
})

test('empty depot: every page shows its empty state and no error', async ({ page }) => {
  await stub.setMode('nw-empty')
  for (const [path, text] of [['/nightwatch/', 'No worker is running.'], ['/nightwatch/attention/', 'Nothing waits for you.'], ['/nightwatch/runs/', 'No run yet.']] as const) {
    await page.goto(`${stub.url}${path}`)
    await expect(page.getByText(text)).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  }
})

test('a down reader shows the error panel with Retry and no code', async ({ page }) => {
  await stub.setMode('nw-down')
  await page.goto(`${stub.url}/nightwatch/runs/`)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
  expect(await page.content()).not.toMatch(/reader_unavailable/)
})

test('polling: a new attention item appears after 10 s and is announced politely', async ({ page }) => {
  await page.goto(`${stub.url}/nightwatch/attention/`)
  const rows = page.locator('tbody tr')
  await expect(rows.first()).toBeVisible()
  const before = await page.locator('table').first().locator('tbody tr').count()
  await stub.setMode('nw-more-attention')
  await page.clock.fastForward(10_500)
  await expect(page.locator('table').first().locator('tbody tr')).toHaveCount(before + 1)
  await expect(page.locator('[aria-live="polite"]')).toContainText('1 new attention item')
})

test('the page makes only GET requests to /api/v1/nightwatch', async ({ page }) => {
  const seen: string[] = []
  page.on('request', (r) => { if (r.url().includes('/api/')) seen.push(`${r.method()} ${new URL(r.url()).pathname}`) })
  await page.goto(`${stub.url}/nightwatch/`)
  await page.waitForLoadState('networkidle')
  expect(seen.length).toBeGreaterThan(0)
  for (const s of seen) expect(s).toMatch(/^GET \/api\/v1\/nightwatch\//)
})
