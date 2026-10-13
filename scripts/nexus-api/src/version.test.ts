import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { API_VERSION } from './version.ts'

const HERE = dirname(fileURLToPath(import.meta.url))

describe('API_VERSION', () => {
  it('looks like v<number>', () => {
    expect(API_VERSION).toMatch(/^v\d+$/)
  })
  it("is the only place in src/ that spells the version literal", () => {
    const offenders = readdirSync(HERE)
      .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'version.ts')
      .filter(f => /['"`]v\d+['"`]|\/api\/v\d/.test(readFileSync(join(HERE, f), 'utf8')))
    expect(offenders).toEqual([])
  })
})
