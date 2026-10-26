// scripts/nexus-web/tests/e2e/oculus.spec.ts
import { expect, test } from '@playwright/test'
import { startStubForOculus } from './stub-server.ts'

let stub: Awaited<ReturnType<typeof startStubForOculus>>
test.beforeAll(async () => { stub = await startStubForOculus() })
test.afterAll(async () => { await stub.close() })
test.beforeEach(async ({ page }) => { await stub.setMode('oc-ok'); await page.clock.install({ time: new Date('2026-10-22T03:00:00Z') }) })

const topBar = (page: import('@playwright/test').Page) => page.getByRole('group', { name: 'Nexus status' })

test('Oculus shows the top bar, the phase table with its limits and the workers', async ({ page }) => {
  await page.goto(`${stub.url}/`)
  await expect(page.getByRole('heading', { name: 'Oculus', level: 1 })).toBeVisible()
  await expect(topBar(page).getByRole('status')).toContainText('Nexus healthy')
  await expect(page.getByText('one claimed ticket at a time (scan lock)')).toBeVisible()
  await expect(page.getByText('window: 7 days')).toBeVisible()
  await expect(page.getByRole('link', { name: /DGS-590/ }).first()).toBeVisible()
})

test('the top bar says unknown, never healthy, when the scheduler jobs never ran', async ({ page }) => {
  await stub.setMode('oc-unknown')
  await page.goto(`${stub.url}/`)
  await expect(topBar(page).getByRole('status')).toContainText('Nexus unknown')
  await expect(topBar(page)).not.toContainText('healthy')
})

test('a failed poll turns the top bar stale (amber) and never keeps the old healthy look', async ({ page }) => {
  await page.goto(`${stub.url}/`)
  await expect(topBar(page).getByRole('status')).toContainText('Nexus healthy')
  await stub.setMode('oc-down')
  await page.clock.fastForward(10_500)
  await expect(topBar(page).getByRole('status')).toContainText('Nexus stale')
  await expect(topBar(page)).not.toContainText('healthy')
  await expect(page.getByText('The last update failed at 10:00 (UTC+7).')).toBeVisible()
})

test('the nav reaches every page and marks the current one', async ({ page }) => {
  await page.goto(`${stub.url}/`)
  for (const [name, heading] of [['Attention', 'Attention'], ['Runs', 'Runs'], ['Plan', 'Plan']] as const) {
    await page.getByRole('navigation', { name: 'Oculus' }).getByRole('link', { name: new RegExp(name) }).click()
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Oculus' }).locator('[aria-current="page"]')).toContainText(name)
  }
})

test('Runs filters go in the URL and narrow the rows', async ({ page }) => {
  await page.goto(`${stub.url}/runs/`)
  const rows = page.locator('tbody tr')
  await expect(rows.first()).toBeVisible()
  const roles = async () => (await rows.locator('td:nth-child(3)').allTextContents()).map((t) => t.trim())
  expect(new Set(await roles()).size).toBeGreaterThan(1)   // the unfiltered table shows several roles, so the check below is not vacuous
  await page.getByLabel('Role').selectOption('reviewer')
  await expect(page).toHaveURL(/role=reviewer/)
  await expect.poll(async () => (await roles()).some((r) => r !== 'reviewer')).toBe(false)   // no other role appears
  const filtered = await roles()
  expect(filtered.length).toBeGreaterThan(0)
  expect(filtered.every((r) => r === 'reviewer')).toBe(true)   // every row is a reviewer
})

test('Runs by role and project: only those runs, and a conductor row has no health dot (Task 9)', async ({ page }) => {
  await page.goto(`${stub.url}/runs/?role=conductor&project=DigiSmith`)
  const rows = page.locator('tbody tr')
  await expect(rows).toHaveCount(1)
  await expect(rows.locator('td[data-label="Role"]')).toHaveText('conductor')
  await expect(rows.locator('td[data-label="Project"]')).toHaveText('DigiSmith')
  await expect(rows.locator('td[data-label="State"]')).toHaveText('-')
  await expect(rows.locator('.st')).toHaveCount(0)
  await expect(page.getByLabel('Role')).toHaveValue('conductor')
  await expect(page.getByLabel('Project')).toHaveValue('DigiSmith')
})

test('Runs shows the Cost column and a dollar value for the fixture run (DGS-590)', async ({ page }) => {
  await page.goto(`${stub.url}/runs/`)
  await expect(page.getByRole('columnheader', { name: 'Cost' })).toBeVisible()
  const first = page.locator('tbody tr').first()
  await expect(first.locator('td[data-label="Cost"]')).toHaveText('$3.41')
  await expect(first.locator('td[data-label="Tokens"]')).toHaveText('1.2M')
  await expect(page.locator('td[data-label="Cost"][title^="unpriced model: claude-mystery-9"]')).toHaveText('-')
})

test('the top bar shows the burn per hour and the seat windows, a stale seat in words (DGS-590)', async ({ page }) => {
  await page.goto(`${stub.url}/`)
  await expect(topBar(page)).toContainText('Burn 4.1M/h · $12.30/h')
  const seats = topBar(page).getByRole('group', { name: 'Seat windows' })
  await expect(seats).toContainText('jack 5h 42% · wk 61%')
  await expect(seats).toContainText('dev0 5h - · wk 88% as of 08:20')
})

test('Run detail: pipeline, event filter, tail and the read-only order', async ({ page }) => {
  await page.goto(`${stub.url}/run/?id=builder-20261022T021000-a1b2c3`)
  await expect(page.getByRole('list', { name: /pipeline/i }).locator('li')).toHaveCount(6)
  await page.getByRole('button', { name: 'Errors' }).click()
  await expect(page.getByRole('button', { name: 'Errors' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: /Tail: on/ }).click()
  await expect(page.getByRole('button', { name: /Tail: off/ })).toBeVisible()
  await expect(page.getByText('Build DGS-590 on the example branch.')).toBeVisible()
  // DGS-590: the tokens card, with the price table and no transcript text
  await expect(page.getByRole('heading', { name: /Tokens and cost/ })).toBeVisible()
  await expect(page.getByText(/Anthropic price table 2026-10-18 · as of 10:40 \(UTC\+7\) · counting/)).toBeVisible()
  await expect(page.getByText('SECRET')).toHaveCount(0)
})

test('an unknown run says so', async ({ page }) => {
  await page.goto(`${stub.url}/run/?id=nope-1`)
  await expect(page.getByText('This run does not exist.')).toBeVisible()
})

test('Plan shows task n of m and the verdicts', async ({ page }) => {
  await page.goto(`${stub.url}/plan/?ticket=DGS-590`)
  await expect(page.getByText(/Task \d+ of \d+/)).toBeVisible()
  await expect(page.getByText('Missing null check')).toBeVisible()
})

test('empty depot: every page shows its empty state and no error', async ({ page }) => {
  await stub.setMode('oc-empty')
  for (const [path, text] of [['/', 'No worker is running.'], ['/attention/', 'Nothing waits for you.'], ['/runs/', 'No run yet.']] as const) {
    await page.goto(`${stub.url}${path}`)
    await expect(page.getByText(text)).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  }
})

test('a down reader shows the error panel with Retry and no code', async ({ page }) => {
  await stub.setMode('oc-down')
  await page.goto(`${stub.url}/runs/`)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
  expect(await page.content()).not.toMatch(/reader_unavailable/)
})

test('polling: a new attention item appears after 10 s and is announced politely', async ({ page }) => {
  await page.goto(`${stub.url}/attention/`)
  const rows = page.locator('tbody tr')
  await expect(rows.first()).toBeVisible()
  const before = await page.locator('table').first().locator('tbody tr').count()
  await stub.setMode('oc-more-attention')
  await page.clock.fastForward(10_500)
  await expect(page.locator('table').first().locator('tbody tr')).toHaveCount(before + 1)
  await expect(page.locator('[aria-live="polite"]')).toContainText('1 new attention item')
})

test('the page makes only GET requests to /api/v1/oculus', async ({ page }) => {
  const seen: string[] = []
  page.on('request', (r) => { if (r.url().includes('/api/')) seen.push(`${r.method()} ${new URL(r.url()).pathname}`) })
  await page.goto(`${stub.url}/`)
  await page.waitForLoadState('networkidle')
  expect(seen.length).toBeGreaterThan(0)
  for (const s of seen) expect(s).toMatch(/^GET \/api\/v1\/oculus\//)
})

test('no Oculus page scrolls sideways at 390 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const path of ['/', '/attention/', '/runs/', '/run/?id=builder-20261022T021000-a1b2c3', '/plan/?ticket=DGS-590']) {
    await page.goto(`${stub.url}${path}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.waitForLoadState('networkidle')
    const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
    expect(scroll, `${path}: scrollWidth ${scroll} > innerWidth ${inner}`).toBeLessThanOrEqual(inner)
  }
})

test('Attention shows the resolve command as text and no button runs it', async ({ page }) => {
  await page.goto(`${stub.url}/attention/`)
  await expect(page.locator('code.cmd').first()).toContainText('dg autonomous attention resolve ')
  await expect(page.getByRole('button', { name: /resolve/i })).toHaveCount(0)
})

test.describe('the index page: agents (DGS-599)', () => {
  test('lists every agent first, then the attention summary', async ({ page }) => {
    await stub.setMode('oc-ok')
    await page.goto(`${stub.url}/`)
    const rows = page.locator('#agents tbody tr')
    await expect(rows).toHaveCount(7)
    await expect(rows.first()).toContainText('dgs-601')
    await expect(rows.last()).toContainText('dgs-571')
    await expect(page.getByRole('heading', { name: 'Attention' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'All attention items' })).toHaveAttribute('href', '/attention/')
  })
  test('filters live in the URL', async ({ page }) => {
    await stub.setMode('oc-ok')
    await page.goto(`${stub.url}/?role=conductor`)
    await expect(page.locator('#agents tbody tr')).toHaveCount(2)
    await page.getByLabel('Workspace').selectOption('w3')
    await expect(page).toHaveURL(/workspace=w3/)
    await expect(page.locator('#agents tbody tr')).toHaveCount(1)
  })
  test('the top-bar count links to the agents section', async ({ page }) => {
    await stub.setMode('oc-ok')
    await page.goto(`${stub.url}/runs/`)
    await page.getByRole('link', { name: /Agents 7/ }).click()
    await expect(page).toHaveURL(/\/#agents$/)
  })
  test('herdr down: the last list stays, marked disconnected, grey dots, no green, and the top bar keeps the count', async ({ page }) => {
    await stub.setMode('oc-herdr-down')
    await page.goto(`${stub.url}/`)
    await expect(page.getByText('Disconnected from herdr, as of 09:20 (UTC+7). Retrying.')).toBeVisible()
    await expect(page.locator('#agents tbody tr')).toHaveCount(7)
    await expect(page.locator('#agents .st.ok')).toHaveCount(0)
    await expect(page.getByRole('link', { name: /Agents 7 .* disconnected/ })).toBeVisible()
  })
  test('herdr down before any snapshot: no list yet', async ({ page }) => {
    await stub.setMode('oc-herdr-down-fresh')
    await page.goto(`${stub.url}/`)
    await expect(page.getByText('Disconnected from herdr. No agent list yet. Retrying.')).toBeVisible()
  })
  test('herdr comes back: the banner goes and the region says so once', async ({ page }) => {
    await stub.setMode('oc-herdr-down')
    await page.goto(`${stub.url}/`)
    await expect(page.getByText(/Disconnected from herdr/)).toBeVisible()
    await stub.setMode('oc-ok')
    // the live poll waits 5 s after each answer: move the page clock past it instead of waiting for real time
    await page.clock.fastForward(5_500)
    await expect(page.getByTestId('agents-live')).toHaveText('Connected to herdr.')
    await expect(page.getByText(/Disconnected from herdr/)).toHaveCount(0)
  })
  test('nothing on the page shows a terminal title or a folder path', async ({ page }) => {
    await stub.setMode('oc-ok')
    await page.goto(`${stub.url}/`)
    await expect(page.locator('#agents tbody tr')).toHaveCount(7)
    const html = await page.content()
    expect(html).not.toMatch(/terminal_title|\/Users\//)
  })
})

// DGS-613: phase times
test('Runs: the Duration cell shows the running phase and its time', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-22T03:00:00Z'))
  await page.goto(`${stub.url}/runs/`)
  const first = page.locator('tbody tr').first().locator('td[data-label="Duration"]')
  await expect(first.locator('[aria-hidden="true"]')).toHaveText('0:50:00 · building 0:14')
  await expect(page.locator('thead th', { hasText: /^Phase$/ })).toHaveCount(0)
})

test('Run page: the strip shows durations and the current step in the info color', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-22T03:00:00Z'))
  await page.goto(`${stub.url}/run/?id=builder-20261022T021000-a1b2c3`)
  const strip = page.getByRole('list', { name: /pipeline/i })
  const steps = strip.locator('li')
  await expect(steps.nth(0).locator('.dur')).toHaveText('0:01')
  await expect(steps.nth(2).locator('.dur')).toHaveText('0:50')
  await expect(steps.nth(2).locator('.dur')).toHaveClass(/live/)
  await expect(strip).not.toContainText('now')
})

test('Runs: the Duration counts every second while a run is running', async ({ page }) => {
  await page.goto(`${stub.url}/runs/`)
  const first = page.locator('tbody tr').first().locator('td[data-label="Duration"] [aria-hidden="true"]')
  await expect(first).toHaveText(/^0:50:0[0-1] · building 0:14$/)   // fake time runs on between install and the first read
  const before = await first.textContent()
  await page.clock.runFor(1000)
  const after = await first.textContent()
  expect(after).not.toBe(before)
  await page.clock.runFor(2000)
  await expect(first).not.toHaveText(after!)
  await expect(page.locator('td[data-label="Duration"] [aria-live], td[data-label="Duration"] [role="status"], td[data-label="Duration"] [role="timer"]')).toHaveCount(0)
})

test('Runs: a hidden tab goes back to the 30 s clock and comes back to one second', async ({ page }) => {
  await page.goto(`${stub.url}/runs/`)
  const first = page.locator('tbody tr').first().locator('td[data-label="Duration"] [aria-hidden="true"]')
  const setVisibility = (v: 'visible' | 'hidden') => page.evaluate((state) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
    document.dispatchEvent(new Event('visibilitychange'))
  }, v)
  await expect(first).toHaveText(/^0:50:/)
  await setVisibility('hidden')
  const hiddenAt = await first.textContent()
  await page.clock.runFor(5_000)
  expect(await first.textContent()).toBe(hiddenAt)        // no per-second tick while hidden
  await page.clock.runFor(25_000)
  expect(await first.textContent()).not.toBe(hiddenAt)    // the 30 s clock still moves it
  await setVisibility('visible')
  const backAt = await first.textContent()
  await page.clock.runFor(1_000)
  expect(await first.textContent()).not.toBe(backAt)
})

test('Run page: the current step and the budget text move on the minute', async ({ page }) => {
  await page.goto(`${stub.url}/run/?id=builder-20261022T021000-a1b2c3`)
  const current = page.getByRole('list', { name: /pipeline/i }).locator('li').nth(2).locator('.dur')
  await expect(current).toHaveText(/^0:5[01]$/)
  const budget = page.getByText(/^building \d+:\d+ of \d+ min/)
  await expect(budget).toHaveText('building 0:14 of 120 min')
  await page.clock.runFor(60_000)
  await expect(current).toHaveText(/^0:5[12]$/)
  await expect(budget).toHaveText('building 0:15 of 120 min')
})
