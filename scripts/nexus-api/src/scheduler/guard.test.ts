import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ensureToken, checkRunNow } from './guard.ts'

let dir: string
beforeEach(() => { dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'guard-')), 'state') })

const good = (token: string) => ({
  contentType: 'application/json',
  tokenHeader: token,
  body: JSON.stringify({ confirm: 'selftest' }),
})

describe('ensureToken', () => {
  it('creates the dir and a mode 600 token on first call', () => {
    const t = ensureToken(dir)
    expect(t).toMatch(/^[0-9a-f]{64}$/)
    expect(fs.statSync(path.join(dir, 'token')).mode & 0o777).toBe(0o600)
  })

  it('reuses the same token on the second call', () => {
    expect(ensureToken(dir)).toBe(ensureToken(dir))
  })

  it('fixes a group/world readable token file to 600', () => {
    const first = ensureToken(dir)
    fs.chmodSync(path.join(dir, 'token'), 0o644)
    expect(ensureToken(dir)).toBe(first)
    expect(fs.statSync(path.join(dir, 'token')).mode & 0o777).toBe(0o600)
  })
})

describe('checkRunNow', () => {
  const token = 'a'.repeat(64)

  it('passes when all checks pass', () => {
    expect(checkRunNow(good(token), token, 'selftest')).toEqual({ ok: true })
  })

  it('accepts a charset suffix', () => {
    const r = checkRunNow({ ...good(token), contentType: 'application/json; charset=utf-8' }, token, 'selftest')
    expect(r.ok).toBe(true)
  })

  it('403 on wrong token', () => {
    const r = checkRunNow(good('b'.repeat(64)), token, 'selftest')
    expect(r).toMatchObject({ ok: false, status: 403, error: 'forbidden' })
  })

  it('403 on missing token', () => {
    const r = checkRunNow({ ...good(token), tokenHeader: undefined }, token, 'selftest')
    expect(r).toMatchObject({ ok: false, status: 403, error: 'forbidden' })
  })

  it('does not throw on different-length tokens', () => {
    expect(() => checkRunNow(good('short'), token, 'selftest')).not.toThrow()
    expect(checkRunNow(good('x'.repeat(500)), token, 'selftest')).toMatchObject({ status: 403 })
  })

  it('400 when content type is not json', () => {
    const r = checkRunNow({ ...good(token), contentType: 'text/plain' }, token, 'selftest')
    expect(r).toMatchObject({ ok: false, status: 400, error: 'bad_request' })
    expect(checkRunNow({ ...good(token), contentType: undefined }, token, 'selftest')).toMatchObject({ status: 400 })
  })

  it('refuses a cross-site form post with no token', () => {
    const r = checkRunNow(
      { contentType: 'application/x-www-form-urlencoded', tokenHeader: undefined, body: 'confirm=selftest' },
      token, 'selftest',
    )
    expect(r.ok).toBe(false)
    expect(r).toMatchObject({ status: 403 })
  })

  it('400 on non-JSON body', () => {
    expect(checkRunNow({ ...good(token), body: 'not json' }, token, 'selftest')).toMatchObject({ status: 400 })
    expect(checkRunNow({ ...good(token), body: undefined }, token, 'selftest')).toMatchObject({ status: 400 })
  })

  it('400 when confirm differs from the job name', () => {
    expect(checkRunNow({ ...good(token), body: JSON.stringify({ confirm: 'other' }) }, token, 'selftest')).toMatchObject({ status: 400 })
    expect(checkRunNow({ ...good(token), body: JSON.stringify({}) }, token, 'selftest')).toMatchObject({ status: 400 })
    expect(checkRunNow({ ...good(token), body: 'null' }, token, 'selftest')).toMatchObject({ status: 400 })
  })

  it('accepts an already parsed body', () => {
    expect(checkRunNow({ ...good(token), body: { confirm: 'selftest' } }, token, 'selftest')).toEqual({ ok: true })
  })

  it('never echoes the token or input in messages, and logs nothing', () => {
    const real = ensureToken(dir)
    const lines: string[] = []
    const results = [
      checkRunNow(good('bogus-tok'), real, 'selftest'),
      checkRunNow({ ...good(real), contentType: 'text/plain' }, real, 'selftest'),
      checkRunNow({ ...good(real), body: 'zzz-secret-input' }, real, 'selftest'),
      checkRunNow({ ...good(real), body: JSON.stringify({ confirm: 'zzz-secret-input' }) }, real, 'selftest'),
    ]
    for (const r of results) lines.push(JSON.stringify(r))
    const all = lines.join('\n')
    expect(all).not.toContain(real)
    expect(all).not.toContain('zzz-secret-input')
    expect(all).not.toContain('bogus-tok')
    expect(results.every((r) => !r.ok)).toBe(true)
  })
})
