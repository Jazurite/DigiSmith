// Proof that Caddy's reverse_proxy passes SSE and websocket upgrades and listens on loopback only (DGS-325).
// Throwaway backend + throwaway Caddy on 127.0.0.1 high ports. Never touches the live OpenCode server, Tailscale Serve or pf.
// Run: CADDY_BIN=/path/to/caddy node scripts/caddy/test-stream.mjs
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import os from 'node:os'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CADDY = process.env.CADDY_BIN
if (!CADDY) { console.error('set CADDY_BIN'); process.exit(2) }
const BACK = 18500, FRONT = 18443
const dir = mkdtempSync(join(os.tmpdir(), 'caddy-test-'))
let failed = 0
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!ok) failed++ }

const backend = http.createServer((req, res) => {
  if (req.url === '/sse') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    let n = 0
    const t = setInterval(() => { res.write(`data: tick ${++n}\n\n`); if (n === 3) { clearInterval(t); res.end() } }, 300)
    return
  }
  res.end('ok')
})
backend.on('upgrade', (req, sock) => {
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
  sock.write(Buffer.concat([Buffer.from([0x81, 5]), Buffer.from('hello')]))
})
await new Promise(r => backend.listen(BACK, '127.0.0.1', r))

writeFileSync(join(dir, 'Caddyfile'), `{
	admin off
	skip_install_trust
	https_port ${FRONT}
	auto_https disable_redirects
	default_bind 127.0.0.1
}
localhost {
	tls internal
	reverse_proxy 127.0.0.1:${BACK}
}
`)
const caddy = spawn(CADDY, ['run', '--config', join(dir, 'Caddyfile'), '--adapter', 'caddyfile'], {
  env: { ...process.env, XDG_DATA_HOME: join(dir, 'data'), XDG_CONFIG_HOME: join(dir, 'cfg') }, stdio: ['ignore', 'ignore', 'pipe'] })
let log = ''; caddy.stderr.on('data', d => { log += d })
const waitUp = async () => { for (let i = 0; i < 50; i++) { try { await new Promise((ok, no) => { const s = net.connect(FRONT, '127.0.0.1', ok); s.on('error', no); s.end() }); return } catch { await new Promise(r => setTimeout(r, 200)) } } throw new Error('caddy did not start\n' + log) }

const finish = () => { caddy.kill('SIGTERM'); backend.close(); process.exit(failed ? 1 : 0) }
try {
  await waitUp()
  // the internal certificate is issued after the listener is up: wait until a TLS handshake works
  for (let i = 0; i < 50; i++) {
    const up = await new Promise(ok => https.get({ host: '127.0.0.1', port: FRONT, path: '/', servername: 'localhost', rejectUnauthorized: false, headers: { host: 'localhost' } }, r => { r.resume(); ok(true) }).on('error', () => ok(false)))
    if (up) break
    await new Promise(r => setTimeout(r, 200))
  }
  check('no sudo or trust-store attempt', !/sudo|installing root certificate/.test(log))

  // SSE: events must arrive spread out in time, not buffered into one chunk
  const times = []
  await new Promise((ok, no) => {
    https.get({ host: '127.0.0.1', port: FRONT, path: '/sse', servername: 'localhost', rejectUnauthorized: false, headers: { host: 'localhost' } }, res => {
      res.on('data', () => times.push(Date.now())); res.on('end', ok)
    }).on('error', no)
  })
  check('SSE: three events, streamed', times.length >= 3 && times[times.length - 1] - times[0] > 400, `(chunks=${times.length}, spread=${times[times.length - 1] - times[0]}ms)`)

  // websocket upgrade
  const wsOk = await new Promise(ok => {
    const req = https.request({ host: '127.0.0.1', port: FRONT, path: '/ws', servername: 'localhost', rejectUnauthorized: false,
      headers: { host: 'localhost', connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-version': '13', 'sec-websocket-key': crypto.randomBytes(16).toString('base64') } })
    req.on('upgrade', (res, sock, head) => { sock.once('data', d => ok(res.statusCode === 101 && Buffer.concat([head, d]).includes('hello'))); if (head.length) ok(head.includes('hello')) })
    req.on('error', () => ok(false)); req.on('response', () => ok(false)); req.end()
    setTimeout(() => ok(false), 3000)
  })
  check('websocket: 101 upgrade and a frame through', wsOk)

  // loopback only: refuse on every non-loopback address of this Mac
  const others = Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address)
  for (const ip of others) {
    const refused = await new Promise(ok => { const s = net.connect({ host: ip, port: FRONT, timeout: 2000 }); s.on('connect', () => { s.destroy(); ok(false) }); s.on('error', () => ok(true)); s.on('timeout', () => { s.destroy(); ok(true) }) })
    check(`refused on ${ip}:${FRONT}`, refused)
  }
} catch (e) { console.error(e.message); failed++ }
finish()
