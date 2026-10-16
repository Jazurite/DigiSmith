import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// No source file may call console.*: the logger is the only writer (spec section 10). print-sudoers.ts writes a rule, no profile data.
const ALLOWED = new Set(['logger.ts', 'print-sudoers.ts'])
describe('no console calls in the API source', () => {
  it('finds none outside logger.ts', () => {
    const dir = new URL('./', import.meta.url)
    const offenders = readdirSync(dir).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts') && !ALLOWED.has(f))
      .filter(f => /\bconsole\./.test(readFileSync(new URL(f, dir), 'utf8')))
    expect(offenders).toEqual([])
  })
})
