import { chmodSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fileKeyProvider, KeyError, selectKeyProvider } from './key-provider.ts'

const dir = () => mkdtempSync(join(tmpdir(), 'nexus-key-'))

describe('file key provider', () => {
  it('fails with key_unavailable when the file is missing and create is off', async () => {
    await expect(fileKeyProvider(join(dir(), 'profile.key')).getKey()).rejects.toMatchObject({ code: 'key_unavailable' })
  })
  it('creates a 32-byte key with mode 600 when create is on, and never overwrites it', async () => {
    const f = join(dir(), 'sub', 'profile.key')
    const k1 = await fileKeyProvider(f, { create: true }).getKey()
    const k2 = await fileKeyProvider(f, { create: true }).getKey()
    expect(k1).toHaveLength(32)
    expect(k1.equals(k2)).toBe(true)
    expect(statSync(f).mode & 0o777).toBe(0o600)
  })
  it('refuses a key file that other users can read', async () => {
    const f = join(dir(), 'profile.key')
    await fileKeyProvider(f, { create: true }).getKey()
    chmodSync(f, 0o644)
    await expect(fileKeyProvider(f).getKey()).rejects.toBeInstanceOf(KeyError)
  })
  it('refuses a key file of the wrong length', async () => {
    const f = join(dir(), 'profile.key')
    writeFileSync(f, Buffer.alloc(5), { mode: 0o600 })
    await expect(fileKeyProvider(f).getKey()).rejects.toMatchObject({ code: 'key_unavailable' })
  })
})

describe('file key provider errors', () => {
  it('a directory at the key path gives a KeyError with no path in the message', async () => {
    const f = join(dir(), 'profile.key')
    mkdirSync(f, { mode: 0o700 })
    const err = await fileKeyProvider(f).getKey().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(KeyError)
    expect((err as Error).message).toBe('key_unavailable')
    expect((err as Error).message).not.toContain(f)
  })
  it('an unwritable parent with create on gives a KeyError, not a raw error', async () => {
    const d = dir()
    const f = join(d, 'ro', 'profile.key')
    mkdirSync(join(d, 'ro'), { mode: 0o500 })
    const err = await fileKeyProvider(f, { create: true }).getKey().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(KeyError)
    chmodSync(join(d, 'ro'), 0o700)
  })
})

describe('selectKeyProvider', () => {
  it('defaults to the file provider', async () => {
    const f = join(dir(), 'profile.key')
    const key = await selectKeyProvider(undefined, { keyFile: f }, { create: true }).getKey()
    expect(key).toHaveLength(32)
  })
  it('keychain is not available yet: it fails closed', async () => {
    await expect(Promise.resolve().then(() => selectKeyProvider('keychain', { keyFile: '/nowhere' }))).rejects.toMatchObject({ code: 'key_unavailable' })
  })
})
