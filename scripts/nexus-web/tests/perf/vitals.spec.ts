import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '../e2e/fixtures'

// web-vitals 6 does not export its dist files, so the IIFE is read by path
const IIFE = readFileSync(join(import.meta.dirname, '../../node_modules/web-vitals/dist/web-vitals.iife.js'), 'utf8')
const BUDGET = { lcp: 2500, inp: 200, cls: 0.1 }
// A starting guard for the grid's own render task. The first real measure may justify moving it: tell the Maestro when you do.
const RENDER_GUARD = { desktop: 100, phone: 400 }

// This Mac is noisy: a stray frame spike (up to ~250 ms with no grid on the page either) can break one run. A real regression fails all three attempts.
test.describe.configure({ retries: 2 })

test('Core Web Vitals stay inside the "good" budgets (local, no analytics)', async ({ stub, page }, info) => {
  // No fake browser clock here: Playwright's clock replaces performance.mark/measure, and the grid-render timing needs the real ones.
  await stub.setMode('ok')
  const app = stub
  test.setTimeout(180_000)   // 600 scripted pointer events on a slow Mac; not a budget
  const phone = info.project.name === 'phone'
  await page.addInitScript({ content: `${IIFE};
    window.__v = { worst: 0 };
    for (const n of ['onLCP', 'onCLS', 'onINP']) webVitals[n](m => { window.__v[m.name] = m.value }, { reportAllChanges: true });
    new PerformanceObserver(l => l.getEntries().forEach(e => { if (e.interactionId) window.__v.worst = Math.max(window.__v.worst, e.duration) })).observe({ type: 'event', durationThreshold: 16, buffered: true });` })
  if (phone) await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: 4 })

  await page.goto(app.url)
  await expect(page.locator('[role="gridcell"]')).toHaveCount(4680)
  await page.waitForTimeout(1500)

  // scripted interaction: pointer sweeps, clicks, taps and keys
  if (phone) {
    const box = await page.locator('[data-row="20"][data-box="20"]').boundingBox()
    // a person taps about every 300 ms; back-to-back synthetic taps only measure the queue under the 4x throttle (a page with no grid shows the same)
    for (let i = 0; i < 12; i++) { await page.touchscreen.tap(box!.x + (i % 6), box!.y + i); await page.waitForTimeout(300) }
  } else {
    const start = await page.locator('[data-row="0"][data-box="0"]').boundingBox()
    await page.mouse.move(start!.x, start!.y)
    for (let i = 0; i < 300; i++) await page.mouse.move(start!.x + (i % 52) * 15, start!.y + Math.floor(i / 52) * 15, { steps: 2 })
    await page.locator('[data-row="36"][data-box="41"]').focus()
    for (let i = 0; i < 40; i++) await page.keyboard.press(i % 7 === 0 ? 'ArrowDown' : 'ArrowRight')
    await page.keyboard.press('PageDown'); await page.keyboard.press('Escape')
  }
  await page.waitForTimeout(500)

  const v = await page.evaluate(() => ({ ...(window as any).__v, render: performance.getEntriesByName('grid-render')[0]?.duration ?? null }))
  expect(v.LCP, 'LCP was measured').toBeGreaterThan(0)
  expect(v.LCP).toBeLessThan(BUDGET.lcp)
  expect(v.CLS ?? 0).toBeLessThan(BUDGET.cls)
  expect(v.INP ?? v.worst).toBeLessThan(BUDGET.inp)   // INP only reports interactions over 40 ms; the observer catches the worst one from 16 ms
  expect(v.render, 'the grid render was timed').not.toBeNull()
  expect(v.render).toBeLessThan(phone ? RENDER_GUARD.phone : RENDER_GUARD.desktop)
  test.info().annotations.push({ type: 'vitals', description: JSON.stringify({ LCP: Math.round(v.LCP), CLS: v.CLS ?? 0, INP: v.INP ?? v.worst, render: Math.round(v.render) }) })
})
