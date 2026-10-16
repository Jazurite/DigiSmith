import type { Page } from '@playwright/test'

// Holds the grid's idle-callback chunks, so the "pending" state (first 10 rows drawn) lasts until release() is called. Deterministic: no timing, no throttling.
export async function holdScheduler(page: Page) {
  await page.addInitScript(() => {
    const real = window.requestIdleCallback?.bind(window)
    const queue: Array<() => void> = []
    let held = true
    ;(window as any).requestIdleCallback = (cb: IdleRequestCallback, o?: IdleRequestOptions) => {
      if (!held) return real ? real(cb, o) : setTimeout(cb, 16) as unknown as number
      const id = queue.length + 1
      queue.push(() => cb({ didTimeout: true, timeRemaining: () => 0 }))
      return id
    }
    ;(window as any).__release = () => { held = false; queue.splice(0).forEach(f => f()) }
  })
  return { release: () => page.evaluate(() => (window as any).__release()) }
}
