import { chmodSync, writeFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { seal } from './profile-crypto.ts'
import { openStore, StoreError } from './profile-store.ts'
import { randomBytes } from 'node:crypto'

const FAKE = { birthDate: '1990-01-01', lifeYears: 90 }   // fake profile
const key = randomBytes(32)
const T = 60_000   // PGlite starts a WebAssembly Postgres; allow it time

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)])
}

describe('profile store (in memory)', () => {
  it('load is null on an empty database', async () => {
    const s = await openStore(undefined)
    expect(await s.load()).toBeNull()
    await s.close()
  }, T)
  it('save then load returns the same bytes; a second save replaces the first', async () => {
    const s = await openStore(undefined)
    const a = seal(FAKE, key), b = seal({ ...FAKE, lifeYears: 80 }, key)
    await s.save(a, 1)
    const got = await s.load()
    expect(got?.nonce.equals(a.nonce)).toBe(true)
    expect(got?.ciphertext.equals(a.ciphertext)).toBe(true)
    await s.save(b, 1)
    expect((await s.load())?.nonce.equals(b.nonce)).toBe(true)
    await s.close()
  }, T)
})

describe('profile store (a real data folder)', () => {
  it('creates the folder with mode 700, keeps the data across a reopen, and holds no plain-text date', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'nexus-db-')), 'db')
    const s = await openStore(dir, { create: true })
    expect(statSync(dir).mode & 0o777).toBe(0o700)
    await s.save(seal(FAKE, key), 1)
    await s.close()
    const again = await openStore(dir, { create: false })
    expect(await again.load()).not.toBeNull()
    await again.close()
    for (const f of filesUnder(dir)) expect(readFileSync(f).includes(Buffer.from('1990-01-01')), f).toBe(false)
  }, T)
  it('the API open (create false) says profile_missing for a missing folder and creates nothing', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'nexus-db-')), 'db')
    await expect(openStore(dir, { create: false })).rejects.toMatchObject({ code: 'profile_missing' })
    expect(() => statSync(dir)).toThrow()
  }, T)
  it('the API open says profile_invalid when the folder can be read by others', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'nexus-db-')), 'db')
    mkdirSync(dir, { mode: 0o755 }); chmodSync(dir, 0o755)
    await expect(openStore(dir, { create: false })).rejects.toBeInstanceOf(StoreError)
    await expect(openStore(dir, { create: false })).rejects.toMatchObject({ code: 'profile_invalid' })
  }, T)
})

describe('profile store (failed start)', () => {
  it('throws instead of hanging when the data path is a file, and leaves the file alone', async () => {
    const f = join(mkdtempSync(join(tmpdir(), 'store-bad-')), 'not-a-dir')
    writeFileSync(f, 'x', { mode: 0o600 })
    await expect(openStore(f)).rejects.toThrow()
    expect(readFileSync(f, 'utf8')).toBe('x')
  }, T)
})
