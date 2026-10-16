import { randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { seed } from '../seed-profile.ts'
import { fileKeyProvider } from './key-provider.ts'
import { createProfileLoader } from './life-calendar-route.ts'
import { createLogger } from './logger.ts'
import { openStore } from './profile-store.ts'
import { createApiServer, HOST } from './server.ts'

const FAKE = { birthDate: '1990-01-01', lifeYears: 90 }   // fake profile
const T = 120_000

describe('no profile value, key, ciphertext or nonce reaches a log line', () => {
  it('holds for a good request and for every error path', async () => {
    // a real fake depot: input -> seed -> key file + encrypted database
    const d = mkdtempSync(join(tmpdir(), 'nexus-logs-'))
    mkdirSync(join(d, 'nexus'), { recursive: true })
    const input = join(d, 'nexus', 'profile.private.json')
    writeFileSync(input, JSON.stringify(FAKE), { mode: 0o600 }); chmodSync(input, 0o600)
    const dataDir = join(d, 'nexus', 'db'), keyFile = join(d, 'nexus', 'profile.key')
    await seed({ inputPath: input, dataDir, keyFile })
    const key = await fileKeyProvider(keyFile).getKey()

    const store = await openStore(dataDir, { create: false })
    const sealed = (await store.load())!
    await store.close()

    const lines: string[] = []
    const logger = createLogger(l => lines.push(l), () => 0)
    const NOW = Date.parse('2026-10-16T14:00:00Z')
    const secrets: string[] = []
    const addVariants = (b: Buffer) => secrets.push(b.toString('hex'), b.toString('base64'), b.toString('base64url'))
    addVariants(key); addVariants(sealed.nonce); addVariants(sealed.ciphertext)
    secrets.push('1990-01-01', '19900101', '01/01/1990', '1 January 1990', 'January 1, 1990', '"lifeYears"', 'sk-FAKE-token-value')

    // one server per call; a loader is closed after its call so two loaders never own the same data folder
    async function hit(loadProfile: (() => Promise<any>) & { close?: () => Promise<void> }, path = '/api/v1/life-calendar', init: RequestInit = {}) {
      const server = createApiServer(async () => null, { logger, loadProfile, now: () => NOW })
      await new Promise<void>(r => server.listen(0, HOST, r))
      try { await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`, init) } finally { await new Promise(r => server.close(r)); await loadProfile.close?.() }
    }

    // 1. a good request through the real loader
    await hit(createProfileLoader({ dataDir, getKey: () => fileKeyProvider(keyFile).getKey() }))
    // 2. a query string and an Authorization header
    await hit(createProfileLoader({ dataDir, getKey: () => fileKeyProvider(keyFile).getKey() }), '/api/v1/life-calendar?birth=1990-01-01', { headers: { Authorization: 'Bearer sk-FAKE-token-value' } })
    // 3. a missing profile
    await hit(createProfileLoader({ dataDir: join(d, 'nexus', 'nope'), getKey: () => fileKeyProvider(keyFile).getKey() }))
    // 4. a missing key
    await hit(createProfileLoader({ dataDir, getKey: () => fileKeyProvider(join(d, 'nexus', 'no.key')).getKey() }))
    // 5. a wrong key
    await hit(createProfileLoader({ dataDir, getKey: async () => randomBytes(32) }))
    // 6. a provider that throws an error whose message holds the fake values
    await hit(async () => { throw new Error(`boom ${FAKE.birthDate} ${key.toString('hex')} sk-FAKE-token-value`) })
    // 7. a changed blob (a second database folder with a tampered ciphertext)
    const bad = join(d, 'nexus', 'db-bad')
    const s2 = await openStore(bad, { create: true })
    const tampered = Buffer.from(sealed.ciphertext); tampered[0] ^= 1
    await s2.save({ nonce: sealed.nonce, ciphertext: tampered }, 1); await s2.close()
    await hit(createProfileLoader({ dataDir: bad, getKey: () => fileKeyProvider(keyFile).getKey() }))
    // 8. a response that fails the shared schema
    await hit(async () => ({ birthDate: FAKE.birthDate, lifeYears: 0 }))

    expect(lines.length).toBeGreaterThanOrEqual(8)
    const text = lines.join('\n')
    for (const s of secrets) expect(text.includes(s), `a log line contains ${s.slice(0, 6)}...`).toBe(false)
    rmSync(d, { recursive: true, force: true })
  }, T)
})
