import type { Page } from '@playwright/test'

// page.clock.install lets fake time run on, so a one-second counter would change a screenshot or a text check while it is taken.
// Fixing Date.now keeps every timer running but makes each tick write the same time.
export async function freezeClock(page: Page, iso: string): Promise<void> {
  await page.clock.install({ time: new Date(iso) })
  await page.clock.setFixedTime(new Date(iso))
}
