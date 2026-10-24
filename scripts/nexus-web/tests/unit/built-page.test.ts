import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const OUT = join(__dirname, '../../.output/public')
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)])
}
describe.skipIf(!existsSync(OUT))('the generated page', () => {
  it('has an index.html with the shell and the skeleton, and no calendar data', () => {
    const html = readFileSync(join(OUT, 'index.html'), 'utf8')
    expect(html).toContain('<h1 class="sr-only">Dashboard</h1>')
    expect(html).toContain('Life Calendar')
    expect(html).not.toMatch(/weeksLived|percentLived|birthDate|lifeYears/)
  })
  it('no built file holds the fake profile or a response shape', () => {
    for (const f of files(OUT).filter(f => /\.(html|js|json|css)$/.test(f))) {
      const text = readFileSync(f, 'utf8')
      expect(text.includes('1990-01-01'), f).toBe(false)
    }
  })
  it('the only API paths the app knows are the life calendar and Nightwatch', () => {
    const js = files(OUT).filter(f => f.endsWith('.js')).map(f => readFileSync(f, 'utf8')).join('\n')
    const paths = new Set(js.match(/\/api\/[a-z0-9/_-]+/g) ?? [])
    expect([...paths].every(p => p.startsWith('/api/v1/life-calendar') || p.startsWith('/api/v1/oculus') || p === '/api/' || p === '/api')).toBe(true)
  })
})
