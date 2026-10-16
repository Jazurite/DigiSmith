import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The built Storybook (pnpm build-storybook) is published under /storybook/: it must not carry the build machine's paths.
// Skips itself when there is no build. `pnpm test:built` builds first.
const OUT = join(__dirname, '../../storybook-static')
const WEB = resolve(__dirname, '../..')
const REPO = resolve(WEB, '../..')
// build-www.sh does not copy these two: the Storybook preset writes the Vite configs (absolute paths) to logs/ and a project.json next to the build
const NOT_PUBLISHED = (rel: string) => rel === 'logs' || rel.startsWith('logs/') || rel === 'project.json'
function files(dir: string, rel = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const r = rel ? `${rel}/${e.name}` : e.name
    return NOT_PUBLISHED(r) ? [] : e.isDirectory() ? files(join(dir, e.name), r) : [r]
  })
}
describe.skipIf(!existsSync(OUT))('the built Storybook (what build-www.sh publishes)', () => {
  it('has no *.config.* file', () => {
    expect(files(OUT).filter(f => /\.config\.[^/]*$/.test(f))).toEqual([])
  })
  it('no text file holds /Users/, the web folder path or the repo root path', () => {
    const bad = files(OUT).filter(f => /\.(html|js|mjs|css|json|map|svg|txt|md|webmanifest)$/.test(f)).filter((f) => {
      const t = readFileSync(join(OUT, f), 'utf8')
      return t.includes('/Users/') || t.includes(WEB) || t.includes(REPO)
    })
    expect(bad).toEqual([])
  })
})
