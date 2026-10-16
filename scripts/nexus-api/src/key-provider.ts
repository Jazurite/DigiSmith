import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes } from 'node:crypto'
import { KEY_BYTES } from './profile-crypto.ts'

export class KeyError extends Error {
  readonly code = 'key_unavailable' as const
  constructor() { super('key_unavailable') }
}
export interface KeyProvider { getKey(): Promise<Buffer> }

// The key file: 32 raw bytes, mode 600. create=true (the seed step only) makes it when missing and never overwrites one.
export function fileKeyProvider(path: string, opts: { create?: boolean } = {}): KeyProvider {
  return {
    async getKey() {
      try {
        if (!existsSync(path)) {
          if (!opts.create) throw new KeyError()
          mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
          try {
            writeFileSync(path, randomBytes(KEY_BYTES), { flag: 'wx', mode: 0o600 })
            chmodSync(path, 0o600)
          } catch (e) {
            // A key made between the check and the write is read below, never overwritten.
            if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
          }
        }
        if ((statSync(path).mode & 0o077) !== 0) throw new KeyError()
        const key = readFileSync(path)
        if (key.length !== KEY_BYTES) throw new KeyError()
        return key
      } catch {
        // Raw fs errors carry the key path in the message: only the code leaves here.
        throw new KeyError()
      }
    },
  }
}

// NEXUS_KEY_PROVIDER picks the provider. 'keychain' arrives with its own task; until then it fails closed.
export function selectKeyProvider(name: string | undefined, paths: { keyFile: string }, opts: { create?: boolean } = {}): KeyProvider {
  if (name === undefined || name === 'file') return fileKeyProvider(paths.keyFile, opts)
  throw new KeyError()
}
