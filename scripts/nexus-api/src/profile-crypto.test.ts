import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { CryptoError, open, seal } from './profile-crypto.ts'

const FAKE = { birthDate: '1990-01-01', lifeYears: 90 }   // fake profile
const key = randomBytes(32)

describe('profile crypto (AES-256-GCM)', () => {
  it('round-trips', () => { expect(open(seal(FAKE, key), key)).toEqual(FAKE) })
  it('uses a new nonce every time, so the same profile gives different bytes', () => {
    const a = seal(FAKE, key), b = seal(FAKE, key)
    expect(a.nonce.equals(b.nonce)).toBe(false)
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false)
  })
  it('the ciphertext holds neither the date nor the field names as plain text', () => {
    const s = seal(FAKE, key).ciphertext.toString('latin1')
    expect(s).not.toContain('1990')
    expect(s).not.toContain('birthDate')
  })
  it.each([
    ['a changed ciphertext byte', (s: ReturnType<typeof seal>) => { const c = Buffer.from(s.ciphertext); c[0] ^= 1; return { ...s, ciphertext: c } }],
    ['a changed tag byte', (s: ReturnType<typeof seal>) => { const c = Buffer.from(s.ciphertext); c[c.length - 1] ^= 1; return { ...s, ciphertext: c } }],
    ['a changed nonce', (s: ReturnType<typeof seal>) => { const n = Buffer.from(s.nonce); n[0] ^= 1; return { ...s, nonce: n } }],
    ['a truncated blob', (s: ReturnType<typeof seal>) => ({ ...s, ciphertext: s.ciphertext.subarray(0, 8) })],
  ])('fails with decrypt_failed for %s', (_n, tamper) => {
    expect(() => open(tamper(seal(FAKE, key)), key)).toThrowError(expect.objectContaining({ code: 'decrypt_failed' }))
  })
  it('fails with decrypt_failed for a wrong key', () => {
    expect(() => open(seal(FAKE, key), randomBytes(32))).toThrowError(expect.objectContaining({ code: 'decrypt_failed' }))
  })
  it('rejects a key that is not 32 bytes', () => {
    expect(() => seal(FAKE, Buffer.alloc(16))).toThrowError(expect.objectContaining({ code: 'bad_key' }))
    expect(() => open(seal(FAKE, key), Buffer.alloc(16))).toThrowError(expect.objectContaining({ code: 'bad_key' }))
  })
  it('an error carries a code only, never the profile values or the key', () => {
    expect.assertions(3)
    try { open(seal(FAKE, key), randomBytes(32)) } catch (e) {
      expect(e).toBeInstanceOf(CryptoError)
      expect((e as Error).message).toBe('decrypt_failed')
      expect(String((e as Error).stack)).not.toContain('1990')
    }
  })
})
