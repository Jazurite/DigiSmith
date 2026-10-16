import { z } from 'zod'
import { parseDay } from '../../nexus-shared/days.ts'
import { open, type Profile } from './profile-crypto.ts'
import { openStore, StoreError, type ProfileStore } from './profile-store.ts'

// The loader: opens the database on the first request (never creates it), reads the key once, decrypts per request.
// The decrypted profile is never kept. Errors carry codes only.
export type ProfileLoader = (() => Promise<Profile>) & { close(): Promise<void> }

export function createProfileLoader(opts: { dataDir: string; getKey: () => Promise<Buffer> }): ProfileLoader {
  let storeP: Promise<ProfileStore> | undefined
  let keyP: Promise<Buffer> | undefined
  const load = async (): Promise<Profile> => {
    storeP ??= openStore(opts.dataDir, { create: false })
    let store: ProfileStore
    try { store = await storeP } catch (e) { storeP = undefined; throw e }   // a missing database may appear later (after the seed step)
    keyP ??= opts.getKey()
    let key: Buffer
    try { key = await keyP } catch (e) { keyP = undefined; throw e }
    const sealed = await store.load()
    if (!sealed) throw new StoreError('profile_missing')
    let profile: Profile
    try { profile = open(sealed, key) } catch { throw new StoreError('profile_invalid') }
    try { parseDay(profile.birthDate) } catch { throw new StoreError('profile_invalid') }
    if (!Number.isInteger(profile.lifeYears) || profile.lifeYears < 1 || profile.lifeYears > 120) throw new StoreError('profile_invalid')
    return profile
  }
  // Only tests close it (PGlite lets one instance own a folder). The server keeps it open until the process ends.
  return Object.assign(load, { close: async () => { const s = await storeP?.catch(() => undefined); await s?.close(); storeP = undefined; keyP = undefined } })
}

export const emptyQuery = z.strictObject({})

export function errorCodeOf(e: unknown): 'profile_missing' | 'profile_invalid' | 'key_unavailable' | 'internal_invalid' {
  const code = (e as { code?: unknown } | null)?.code
  return code === 'profile_missing' || code === 'profile_invalid' || code === 'key_unavailable' ? code : 'internal_invalid'
}
