import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const AAD = Buffer.from('nexus-profile:v1')
export const KEY_BYTES = 32
export const NONCE_BYTES = 12
const TAG_BYTES = 16

export interface Profile { birthDate: string; lifeYears: number }
export interface Sealed { nonce: Buffer; ciphertext: Buffer }   // ciphertext = encrypted blob followed by the 16-byte tag

// Errors carry a code only. No message is ever built from data.
export class CryptoError extends Error {
  readonly code: 'bad_key' | 'decrypt_failed' | 'bad_profile'
  constructor(code: 'bad_key' | 'decrypt_failed' | 'bad_profile') { super(code); this.code = code }
}

export function seal(profile: Profile, key: Buffer): Sealed {
  if (key.length !== KEY_BYTES) throw new CryptoError('bad_key')
  const nonce = randomBytes(NONCE_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(AAD)
  const body = Buffer.concat([cipher.update(JSON.stringify(profile), 'utf8'), cipher.final()])
  return { nonce, ciphertext: Buffer.concat([body, cipher.getAuthTag()]) }
}

export function open(sealed: Sealed, key: Buffer): Profile {
  if (key.length !== KEY_BYTES) throw new CryptoError('bad_key')
  if (sealed.nonce.length !== NONCE_BYTES || sealed.ciphertext.length <= TAG_BYTES) throw new CryptoError('decrypt_failed')
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, sealed.nonce)
    decipher.setAAD(AAD)
    decipher.setAuthTag(sealed.ciphertext.subarray(sealed.ciphertext.length - TAG_BYTES))
    const text = Buffer.concat([decipher.update(sealed.ciphertext.subarray(0, sealed.ciphertext.length - TAG_BYTES)), decipher.final()]).toString('utf8')
    const value = JSON.parse(text) as Partial<Profile>
    if (typeof value.birthDate !== 'string' || typeof value.lifeYears !== 'number') throw new CryptoError('bad_profile')
    return { birthDate: value.birthDate, lifeYears: value.lifeYears }
  } catch (e) {
    if (e instanceof CryptoError) throw e
    throw new CryptoError('decrypt_failed')
  }
}
