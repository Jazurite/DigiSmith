// scripts/nexus-web/tests/unit/built-nightwatch.test.ts
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const OUT = join(__dirname, '../../.output/public')
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)])
}
const PAGES = [['nightwatch/index.html', 'Operations'], ['nightwatch/attention/index.html', 'Attention'], ['nightwatch/runs/index.html', 'Runs'], ['nightwatch/run/index.html', 'Run'], ['nightwatch/plan/index.html', 'Plan']] as const

describe.skipIf(!existsSync(OUT))('the generated Nightwatch pages', () => {
  it.each(PAGES)('%s exists and holds its h1', (file, h1) => {
    const html = readFileSync(join(OUT, file), 'utf8')
    expect(html).toMatch(new RegExp(`<h1[^>]*>\\s*${h1}\\s*</h1>`))
  })
  it.each(PAGES)('%s holds no fixture value', (file) => {
    const html = readFileSync(join(OUT, file), 'utf8')
    expect(html).not.toContain('DGS-590')
    expect(html).not.toContain('builder-2026')
  })
  it.each(PAGES)('%s is prerendered as loading: no live data, and never an error or a healthy look', (file) => {
    const html = readFileSync(join(OUT, file), 'utf8')
    expect(html).toContain('Nexus loading')
    expect(html).not.toMatch(/Nexus (healthy|stale|unreachable)|The last update failed/)
  })
  it('the generated Run page never says the run does not exist (the id is only known on the client)', () => {
    expect(readFileSync(join(OUT, 'nightwatch/run/index.html'), 'utf8')).not.toContain('does not exist')
  })
  it('no built file loads a font or script from another host', () => {
    for (const f of files(OUT).filter(f => /\.(html|js|css)$/.test(f))) {
      const text = readFileSync(f, 'utf8')
      expect(text.match(/<script[^>]+src=["']https?:\/\//g), f).toBeNull()
      expect(text.match(/@font-face[^}]*url\(["']?https?:\/\//g), f).toBeNull()
      expect(text.match(/<link[^>]+href=["']https?:\/\/[^"']*(font|\.css|\.js)/g), f).toBeNull()
    }
  })
  it('every /api/ path in the JS is a Life Calendar or Nightwatch path', () => {
    const js = files(OUT).filter(f => f.endsWith('.js')).map(f => readFileSync(f, 'utf8')).join('\n')
    const paths = [...new Set(js.match(/\/api\/[a-z0-9/_-]+/g) ?? [])]
    expect(paths.some(p => p.startsWith('/api/v1/oculus'))).toBe(true)
    expect(paths.filter(p => p !== '/api/' && !p.startsWith('/api/v1/oculus') && !p.startsWith('/api/v1/life-calendar'))).toEqual([])
  })
  it('ships the Warren notice in a built CSS file', () => {
    const css = files(OUT).filter(f => f.endsWith('.css')).map(f => readFileSync(f, 'utf8')).join('\n')
    expect(css).toContain('Copyright (c) 2026 Jaymin West')
    // the whole MIT notice, not just the copyright line
    expect(css).toContain('Permission is hereby granted, free of charge, to any person obtaining a copy of this software')
    expect(css).toContain('The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.')
    expect(css).toContain('WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED')
    expect(css).toContain('IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM')
    expect(css).toContain('github.com/jayminwest/warren/blob/main/docs/ui-revamp/tokens.css')
  })
  it('ships the notice as a file too', () => {
    const txt = readFileSync(join(OUT, 'THIRD-PARTY-NOTICES.txt'), 'utf8')
    expect(txt).toContain('Copyright (c) 2026 Jaymin West')
    expect(txt).toContain('Permission is hereby granted')
    expect(txt).toContain('THE SOFTWARE IS PROVIDED "AS IS"')
  })
})
