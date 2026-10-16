import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { fixture } from './tests/fixtures'

const HERE = dirname(fileURLToPath(import.meta.url))
function check(api: number, page: string, apiBody: unknown) {
  return new Promise<{ out: string; code: number | null }>(resolve => {
    const s = createServer((req, res) => {
      if (req.url === '/api/v1/life-calendar') { res.writeHead(api, { 'content-type': 'application/json' }); res.end(JSON.stringify(apiBody)) }
      else if (req.url === '/api/v1/power-metrics') { res.writeHead(200); res.end('{}') }
      else if (req.url === '/' || req.url === '/storybook/') { res.writeHead(200); res.end(page) }
      else { res.writeHead(404); res.end() }
    }).listen(0, '127.0.0.1', () => {
      const port = (s.address() as AddressInfo).port
      const child = spawn('node', [join(HERE, 'health-check.mjs')], { env: { PATH: process.env.PATH ?? '', HEALTH_API: `http://127.0.0.1:${port}`, HEALTH_SITE: `http://127.0.0.1:${port}`, HEALTH_STORYBOOK: '1' } })
      let out = ''
      child.stdout.on('data', d => { out += d }); child.stderr.on('data', d => { out += d })
      child.on('close', code => { s.close(); resolve({ out, code }) })
    })
  })
}
describe('health-check.mjs', () => {
  it('prints ok and exits 0 when the API, the page and Storybook answer', async () => {
    const r = await check(200, '<h1 class="sr-only">Dashboard</h1>', fixture())
    expect(r.out.trim()).toBe('ok'); expect(r.code).toBe(0)
  })
  it('prints only the failing check name, never a number or a date from the response', async () => {
    const r = await check(503, '<h1 class="sr-only">Dashboard</h1>', { error: 'key_unavailable' })
    expect(r.code).toBe(1)
    expect(r.out.trim()).toBe('fail: life-calendar')
  })
  it('fails when the page does not hold the dashboard heading', async () => {
    expect((await check(200, '<p>x</p>', fixture())).out.trim()).toBe('fail: page')
  })
  it('a body that is not plausible (nothing lived) fails without printing the totals', async () => {
    const bad = { ...fixture('1989-12-31') }
    const r = await check(200, '<h1 class="sr-only">Dashboard</h1>', bad)
    expect(r.out.trim()).toBe('fail: life-calendar-range')
    expect(r.out).not.toMatch(/\d{4}/)
  })
})
