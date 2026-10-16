import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { open } from './src/profile-crypto.ts'
import { openStore } from './src/profile-store.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const FAKE = { birthDate: '1990-01-01', lifeYears: 90 }   // fake profile
const T = 90_000

function depot(input: unknown, mode = 0o600) {
  const d = mkdtempSync(join(tmpdir(), 'nexus-seed-'))
  mkdirSync(join(d, 'nexus'), { recursive: true })
  const f = join(d, 'nexus', 'profile.private.json')
  writeFileSync(f, typeof input === 'string' ? input : JSON.stringify(input), { mode })
  chmodSync(f, mode)
  return d
}
const run = (d: string) => spawnSync('node', ['--experimental-strip-types', join(HERE, 'seed-profile.ts')], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '', HOME: d, DIGISMITH_DEPOT: d } })

describe('seed step', () => {
  it('prints nothing on success, creates the key (600) and the encrypted row, and leaves the input untouched', async () => {
    const d = depot(FAKE)
    const before = readFileSync(join(d, 'nexus/profile.private.json'), 'utf8')
    const r = run(d)
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toBe('')
    expect(r.stderr).toBe('')
    expect(readFileSync(join(d, 'nexus/profile.private.json'), 'utf8')).toBe(before)
    expect(statSync(join(d, 'nexus/profile.private.json')).mode & 0o777).toBe(0o600)
    expect(statSync(join(d, 'nexus/profile.key')).mode & 0o777).toBe(0o600)
    const s = await openStore(join(d, 'nexus/db'), { create: false })
    const sealed = await s.load()
    await s.close()
    expect(open(sealed!, readFileSync(join(d, 'nexus/profile.key')))).toEqual(FAKE)
  }, T)
  it('a second run keeps the same key and replaces the row', () => {
    const d = depot(FAKE)
    expect(run(d).status).toBe(0)
    const key1 = readFileSync(join(d, 'nexus/profile.key'))
    writeFileSync(join(d, 'nexus/profile.private.json'), JSON.stringify({ ...FAKE, lifeYears: 85 }))
    expect(run(d).status).toBe(0)
    expect(readFileSync(join(d, 'nexus/profile.key')).equals(key1)).toBe(true)
  }, T)
  it.each([
    ['input_mode', () => depot(FAKE, 0o644)],
    ['input_missing', () => mkdtempSync(join(tmpdir(), 'nexus-seed-'))],
    ['input_json', () => depot('not json')],
    ['field:birthDate', () => depot({ ...FAKE, birthDate: '1990-02-30' })],
    ['field:birthDate', () => depot({ ...FAKE, birthDate: '2999-01-01' })],
    ['field:lifeYears', () => depot({ ...FAKE, lifeYears: 0 })],
    ['field:lifeYears', () => depot({ ...FAKE, lifeYears: '90' })],
    ['field:lifeYears', () => depot({ ...FAKE, lifeYears: 1.5 })],
    ['field:lifeYears', () => depot({ ...FAKE, lifeYears: -5 })],
    ['field:lifeYears', () => depot({ ...FAKE, lifeYears: 121 })],
    ['input_invalid', () => depot({ ...FAKE, extra: 1 })],
  ])('fails with "%s", exit 1, and prints no value', (step, make) => {
    const r = run(make())
    expect(r.status).toBe(1)
    expect(r.stdout).toBe('')
    expect(r.stderr).toBe(`seed failed: ${step}\n`)
    expect(r.stderr).not.toContain('1990')
  }, T)
  it('does not create a key or a database when the input is bad', () => {
    const d = depot({ ...FAKE, lifeYears: 0 })
    run(d)
    expect(existsSync(join(d, 'nexus/profile.key'))).toBe(false)
    expect(existsSync(join(d, 'nexus/db'))).toBe(false)
  }, T)
})
