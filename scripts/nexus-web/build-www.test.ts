import { spawnSync } from 'node:child_process'
import { chmodSync, symlinkSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'www-test-'))
  const bin = join(root, 'bin'); mkdirSync(bin)
  // a fake pnpm: "generate" makes .output/public/index.html in the web folder; "build-storybook" makes storybook-static/
  writeFileSync(join(bin, 'pnpm'), `#!/bin/sh
case "$*" in
  *generate*) mkdir -p "$WEB/.output/public/_nuxt" && echo "<h1>page $STAMP</h1>" > "$WEB/.output/public/index.html" && echo x > "$WEB/.output/public/_nuxt/a.js" ;;
  *build-storybook*) mkdir -p "$WEB/storybook-static" && echo "<h1>sb</h1>" > "$WEB/storybook-static/index.html" ;;
esac
`)
  chmodSync(join(bin, 'pnpm'), 0o755)
  const web = join(root, 'web'); mkdirSync(web)
  return { root, bin, web, depot: join(root, 'depot') }
}
const run = (s: ReturnType<typeof setup>, extra: Record<string, string> = {}) =>
  spawnSync('sh', [join(HERE, 'build-www.sh')], { encoding: 'utf8', env: { PATH: `${s.bin}:${process.env.PATH}`, HOME: s.root, DEPOT: s.depot, WEB: s.web, ...extra } })

describe('build-www.sh', () => {
  it('builds into www.d/<stamp>, points the www symlink at it, and serves index.html through it', () => {
    const s = setup()
    const r = run(s, { STAMP: '1', SKIP_STORYBOOK: '1' })
    expect(r.status, r.stderr).toBe(0)
    expect(lstatSync(join(s.depot, 'nexus/www')).isSymbolicLink()).toBe(true)
    expect(readFileSync(join(s.depot, 'nexus/www/index.html'), 'utf8')).toContain('page 1')
    expect(existsSync(join(s.depot, 'nexus/www/storybook'))).toBe(false)
  })
  it('a second run switches the symlink to the new build and keeps the old one', () => {
    const s = setup()
    run(s, { STAMP: '1', SKIP_STORYBOOK: '1' })
    const first = readlinkSync(join(s.depot, 'nexus/www'))
    run(s, { STAMP: '2', SKIP_STORYBOOK: '1' })
    expect(readlinkSync(join(s.depot, 'nexus/www'))).not.toBe(first)
    expect(readFileSync(join(s.depot, 'nexus/www/index.html'), 'utf8')).toContain('page 2')
    expect(readdirSync(join(s.depot, 'nexus/www.d'))).toHaveLength(2)   // nothing is deleted
  })
  it('adds storybook/ next to the page when it is built', () => {
    const s = setup()
    expect(run(s, { STAMP: '1' }).status).toBe(0)
    expect(readFileSync(join(s.depot, 'nexus/www/storybook/index.html'), 'utf8')).toContain('sb')
  })
  it('refuses to replace a real directory called www and leaves it alone', () => {
    const s = setup()
    mkdirSync(join(s.depot, 'nexus/www'), { recursive: true })
    const r = run(s, { STAMP: '1', SKIP_STORYBOOK: '1' })
    expect(r.status).not.toBe(0)
    expect(lstatSync(join(s.depot, 'nexus/www')).isDirectory()).toBe(true)
  })
  it('replaces the placeholder symlink that caddy-run.sh makes before the first build', () => {
    const s = setup()
    mkdirSync(join(s.depot, 'nexus/www.d/empty'), { recursive: true })
    symlinkSync('www.d/empty', join(s.depot, 'nexus/www'))
    const r = run(s, { STAMP: '1', SKIP_STORYBOOK: '1' })
    expect(r.status, r.stderr).toBe(0)
    expect(readlinkSync(join(s.depot, 'nexus/www'))).toBe('www.d/1')
    expect(readFileSync(join(s.depot, 'nexus/www/index.html'), 'utf8')).toContain('page 1')
    expect(existsSync(join(s.depot, 'nexus/www.d/empty'))).toBe(true)
  })
  it('a stale www.next link does not stop the switch', () => {
    const s = setup()
    mkdirSync(join(s.depot, 'nexus/www.d/old'), { recursive: true })
    symlinkSync('www.d/old', join(s.depot, 'nexus/www.next'))
    const r = run(s, { STAMP: '1', SKIP_STORYBOOK: '1' })
    expect(r.status, r.stderr).toBe(0)
    expect(readlinkSync(join(s.depot, 'nexus/www'))).toBe('www.d/1')
  })
  it('runs the built-page check after generate and fails the build when it fails', () => {
    const s = setup()
    writeFileSync(join(s.bin, 'pnpm'), readFileSync(join(s.bin, 'pnpm'), 'utf8').replace('esac', '  *vitest*) exit 1 ;;\nesac'))
    const r = run(s, { STAMP: '1', SKIP_STORYBOOK: '1' })
    expect(r.status).not.toBe(0)
    expect(r.stderr).toMatch(/built-page check failed/)
    expect(existsSync(join(s.depot, 'nexus/www'))).toBe(false)
  })
})
