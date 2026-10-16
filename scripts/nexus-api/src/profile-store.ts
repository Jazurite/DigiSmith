import { PGlite } from '@electric-sql/pglite'
import { chmodSync, existsSync, mkdirSync, statSync } from 'node:fs'
import type { Sealed } from './profile-crypto.ts'

export class StoreError extends Error {
  readonly code: 'profile_missing' | 'profile_invalid'
  constructor(code: 'profile_missing' | 'profile_invalid') { super(code); this.code = code }
}

export interface ProfileStore {
  save(sealed: Sealed, keyVersion: number): Promise<void>
  load(): Promise<Sealed | null>
  close(): Promise<void>
}

const SCHEMA = `CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  key_version INTEGER NOT NULL,
  nonce BYTEA NOT NULL,
  ciphertext BYTEA NOT NULL
)`

// dataDir undefined = in memory (tests). create=true (the seed step): make the folder with mode 700.
// create=false (the API): the folder must already exist and must be mode 700, or the profile is missing or invalid; nothing is created.
export async function openStore(dataDir: string | undefined, opts: { create?: boolean } = {}): Promise<ProfileStore> {
  if (dataDir !== undefined) {
    if (opts.create) {
      mkdirSync(dataDir, { recursive: true, mode: 0o700 })
      chmodSync(dataDir, 0o700)
    } else {
      if (!existsSync(dataDir)) throw new StoreError('profile_missing')
      if ((statSync(dataDir).mode & 0o077) !== 0) throw new StoreError('profile_invalid')
    }
  }
  const db = dataDir === undefined ? new PGlite() : new PGlite(dataDir)
  try {
    await db.waitReady
    await db.exec(SCHEMA)
  } catch (e) {
    try { await db.close() } catch { /* already closed or never opened */ }
    throw e
  }
  return {
    async save(sealed, keyVersion) {
      await db.query(
        'INSERT INTO profile (id, key_version, nonce, ciphertext) VALUES (1, $1, $2, $3) ON CONFLICT (id) DO UPDATE SET key_version = EXCLUDED.key_version, nonce = EXCLUDED.nonce, ciphertext = EXCLUDED.ciphertext',
        [keyVersion, sealed.nonce, sealed.ciphertext],
      )
    },
    async load() {
      const r = await db.query<{ nonce: Uint8Array; ciphertext: Uint8Array }>('SELECT nonce, ciphertext FROM profile WHERE id = 1')
      const row = r.rows[0]
      return row ? { nonce: Buffer.from(row.nonce), ciphertext: Buffer.from(row.ciphertext) } : null
    },
    async close() { await db.close() },
  }
}
