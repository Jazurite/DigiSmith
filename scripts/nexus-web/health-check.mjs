// Health check for the life dashboard (DGS-481). Prints "ok" or "fail: <check>" and nothing else.
// It never prints anything from the response: the totals are derived from the birth date.
// Env: HEALTH_API (default http://127.0.0.1:4300), HEALTH_SITE (default https://127.0.0.1:8443 with Host pazurite.com), HEALTH_STORYBOOK=1 to check /storybook/.
import https from 'node:https'
import http from 'node:http'

const API = process.env.HEALTH_API ?? 'http://127.0.0.1:4300'
const SITE = process.env.HEALTH_SITE ?? 'https://127.0.0.1:8443'

function get(base, path) {
  return new Promise(resolve => {
    const u = new URL(path, base)
    const mod = u.protocol === 'https:' ? https : http
    const req = mod.get({ host: u.hostname, port: u.port, path: u.pathname, headers: { host: u.protocol === 'https:' ? 'pazurite.com' : u.host }, servername: 'pazurite.com', rejectUnauthorized: u.protocol !== 'https:' || u.hostname !== '127.0.0.1' }, res => {
      let body = ''
      res.on('data', d => { body += d })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
    })
    req.on('error', () => resolve({ status: 0, body: '' }))
    req.setTimeout(10_000, () => { req.destroy(); resolve({ status: 0, body: '' }) })
  })
}
const fail = name => { console.log(`fail: ${name}`); process.exit(1) }

const cal = await get(API, '/api/v1/life-calendar')
if (cal.status !== 200) fail('life-calendar')
let json
try { json = JSON.parse(cal.body) } catch { fail('life-calendar') }
const t = json?.totals
if (!t || !(t.weeksLived > 0 && t.weeksLived < t.weeksTotal && t.weeksLeft >= 0) || 'birthDate' in json) fail('life-calendar-range')

const power = await get(API, '/api/v1/power-metrics')
if (power.status !== 200) fail('power-metrics')

const page = await get(SITE, '/')
if (page.status !== 200 || !page.body.includes('<h1 class="sr-only">Dashboard</h1>')) fail('page')

if (process.env.HEALTH_STORYBOOK === '1') {
  const sb = await get(SITE, '/storybook/')
  if (sb.status !== 200) fail('storybook')
}
console.log('ok')
