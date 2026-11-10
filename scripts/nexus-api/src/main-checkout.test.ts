import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

async function load(env?: string) {
  vi.resetModules()
  if (env === undefined) vi.stubEnv('DIGISMITH_MAIN_CHECKOUT', undefined as unknown as string)
  else vi.stubEnv('DIGISMITH_MAIN_CHECKOUT', env)
  return import('./main-checkout.ts')
}

afterEach(() => { vi.unstubAllEnvs() })

describe('main checkout constant', () => {
  it('defaults to the Engineering path under HOME', async () => {
    const m = await load()
    expect(m.MAIN_CHECKOUT).toBe(join(homedir(), 'Workspace', 'Engineering', 'Jazurite', 'DigiSmith'))
    expect(m.MAIN_CLI).toBe(join(m.MAIN_CHECKOUT, 'packages', 'cli', 'dist', 'index.js'))
  })

  it('takes DIGISMITH_MAIN_CHECKOUT at import time', async () => {
    const m = await load('/somewhere/else')
    expect(m.MAIN_CHECKOUT).toBe('/somewhere/else')
    expect(m.MAIN_CLI).toBe('/somewhere/else/packages/cli/dist/index.js')
  })

  it('checkMainCheckout reports a missing CLI', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mc-'))
    const m = await load(dir)
    expect(m.checkMainCheckout()).toEqual({ ok: false, path: dir, cli: join(dir, 'packages', 'cli', 'dist', 'index.js') })
  })

  it('checkMainCheckout reports an existing CLI', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mc-'))
    mkdirSync(join(dir, 'packages', 'cli', 'dist'), { recursive: true })
    writeFileSync(join(dir, 'packages', 'cli', 'dist', 'index.js'), '')
    const m = await load(dir)
    expect(m.checkMainCheckout().ok).toBe(true)
  })

  it('missingCliMessage names the path and the env var', async () => {
    const m = await load('/x')
    expect(m.missingCliMessage()).toBe('main checkout CLI missing: /x/packages/cli/dist/index.js (set DIGISMITH_MAIN_CHECKOUT)')
  })
})
