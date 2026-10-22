// scripts/nexus-api/src/nightwatch-reader.test.ts
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createReader, DEFAULT_ENTRY, ReaderError } from './nightwatch-reader.ts'

// A fake "CLI": a node script that records its argv in a counter file and prints JSON.
function fakeCli(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'nw-reader-'))
  const file = join(dir, 'index.js')
  writeFileSync(file, body)
  chmodSync(file, 0o644)
  return file
}
const echo = `
const fs = require('node:fs')
const c = process.env.COUNT_FILE
if (c) fs.appendFileSync(c, 'x')
if (process.argv.includes('--run=missing')) { process.stderr.write('not found\\n'); process.exit(1) }
process.stdout.write(JSON.stringify({ argv: process.argv.slice(2) }) + '\\n')
`

describe('createReader', () => {
  it('runs the built CLI with an argument array and parses the JSON', async () => {
    const read = createReader({ entry: fakeCli(echo), ttlMs: 0 })
    expect(await read('runs', { role: 'builder', limit: 5 })).toEqual({ argv: ['nightwatch', 'view', 'runs', '--limit=5', '--role=builder'] })
  })
  it('sorts the flags, skips undefined ones, and never lets a value become a flag or a shell word', async () => {
    const read = createReader({ entry: fakeCli(echo), ttlMs: 0 })
    const out = (await read('plan', { ticket: 'DGS-590; rm -rf /', group: undefined })) as { argv: string[] }
    expect(out.argv).toEqual(['nightwatch', 'view', 'plan', '--ticket=DGS-590; rm -rf /'])
  })
  it('one spawn serves concurrent calls and the cache serves the next 5 s', async () => {
    const countFile = join(mkdtempSync(join(tmpdir(), 'nw-count-')), 'n')
    let t = 1_000
    const read = createReader({ entry: fakeCli(echo), ttlMs: 5_000, now: () => t, env: { ...process.env, COUNT_FILE: countFile } })
    await Promise.all([read('overview'), read('overview'), read('overview')])
    t += 4_000
    await read('overview')
    expect(readFileSync(countFile, 'utf8')).toBe('x')
    t += 2_000
    await read('overview')
    expect(readFileSync(countFile, 'utf8')).toBe('xx')
  })
  it('a different argument set is a different cache entry', async () => {
    const countFile = join(mkdtempSync(join(tmpdir(), 'nw-count-')), 'n')
    const read = createReader({ entry: fakeCli(echo), ttlMs: 5_000, env: { ...process.env, COUNT_FILE: countFile } })
    await read('runs', { role: 'builder' })
    await read('runs', { role: 'reviewer' })
    expect(readFileSync(countFile, 'utf8')).toBe('xx')
  })
  it('exit 1 with "not found" is not_found; other failures are reader_unavailable', async () => {
    const read = createReader({ entry: fakeCli(echo), ttlMs: 0 })
    await expect(read('run', { run: 'missing' })).rejects.toMatchObject({ code: 'not_found' })
    const bad = createReader({ entry: fakeCli('process.exit(3)'), ttlMs: 0 })
    await expect(bad('overview')).rejects.toMatchObject({ code: 'reader_unavailable' })
    const junk = createReader({ entry: fakeCli("process.stdout.write('not json')"), ttlMs: 0 })
    await expect(junk('overview')).rejects.toBeInstanceOf(ReaderError)
  })
  it('a missing build is reader_unavailable', async () => {
    const read = createReader({ entry: join(tmpdir(), 'nw-no-such-dir', 'index.js'), ttlMs: 0 })
    await expect(read('overview')).rejects.toMatchObject({ code: 'reader_unavailable' })
  })
  it('a hung CLI is killed at the timeout', async () => {
    const read = createReader({ entry: fakeCli('setInterval(() => {}, 1000)'), ttlMs: 0, timeoutMs: 300 })
    await expect(read('overview')).rejects.toMatchObject({ code: 'reader_unavailable' })
  })
  it('a failed call is not cached', async () => {
    const entry = fakeCli('process.exit(2)')
    const read = createReader({ entry, ttlMs: 60_000 })
    await expect(read('overview')).rejects.toBeInstanceOf(ReaderError)
    writeFileSync(entry, echo)
    await expect(read('overview')).resolves.toBeTruthy()
  })
  it('the default entry is the main checkout build, not the depot', () => {
    expect(DEFAULT_ENTRY).toMatch(/Workspace\/Jazurite\/DigiSmith\/packages\/cli\/dist\/index\.js$/)
  })
  it('rejects a value that starts with a dash, a non-allowlisted key and a key with =, without spawning', async () => {
    const countFile = join(mkdtempSync(join(tmpdir(), 'nw-count-')), 'n')
    const read = createReader({ entry: fakeCli(echo), ttlMs: 0, env: { ...process.env, COUNT_FILE: countFile } })
    await expect(read('plan', { ticket: '--role' })).rejects.toMatchObject({ code: 'reader_unavailable' })
    await expect(read('plan', { ticket: '-x' })).rejects.toMatchObject({ code: 'reader_unavailable' })
    await expect(read('plan', { 'ticket=x': 'a' })).rejects.toMatchObject({ code: 'reader_unavailable' })
    await expect(read('plan', { cwd: 'a' })).rejects.toMatchObject({ code: 'reader_unavailable' })
    await expect(read('plan', { ticket: {} as unknown as string })).rejects.toMatchObject({ code: 'reader_unavailable' })
    const err = await read('plan', { ticket: '--secret-value' }).catch((e) => e)
    expect(err.message).not.toContain('secret')
    expect(() => readFileSync(countFile, 'utf8')).toThrow()
  })
  it('evicts expired entries first, then the oldest, instead of wiping the cache', async () => {
    const countFile = join(mkdtempSync(join(tmpdir(), 'nw-count-')), 'n')
    let t = 1_000
    const read = createReader({ entry: fakeCli(echo), ttlMs: 5_000, maxEntries: 3, now: () => t, env: { ...process.env, COUNT_FILE: countFile } })
    await read('runs', { role: 'a' })
    t += 4_000
    await read('runs', { role: 'b' })
    await read('runs', { role: 'c' })
    t += 2_000 // a is expired, b and c are fresh
    await read('runs', { role: 'd' }) // evicts expired a only
    expect(readFileSync(countFile, 'utf8')).toBe('xxxx')
    await read('runs', { role: 'b' })
    await read('runs', { role: 'c' })
    expect(readFileSync(countFile, 'utf8')).toBe('xxxx')
    await read('runs', { role: 'e' }) // nothing expired: evicts the oldest (b)
    await read('runs', { role: 'c' })
    await read('runs', { role: 'd' })
    expect(readFileSync(countFile, 'utf8')).toBe('xxxxx')
    await read('runs', { role: 'b' })
    expect(readFileSync(countFile, 'utf8')).toBe('xxxxxx')
  })
})
