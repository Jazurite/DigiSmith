import { test as base, expect } from '@playwright/test'
import { join } from 'node:path'
import { startStub } from './stub-server.ts'

type Stub = Awaited<ReturnType<typeof startStub>>
export const PAGE_DIR = join(import.meta.dirname, '../../.output/public')

export const test = base.extend<{ app: Stub }, { stub: Stub }>({
  stub: [async ({}, use) => { const s = await startStub({ dir: PAGE_DIR }); await use(s); await s.close() }, { scope: 'worker' }],
  app: async ({ stub, page }, use) => {
    await stub.setMode('ok')
    await page.clock.install({ time: new Date('2026-10-16T14:00:00Z') })   // the browser clock matches the stub clock
    await use(stub)
  },
})
export { expect }
