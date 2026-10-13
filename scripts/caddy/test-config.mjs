// Tests for the Caddy front door files (DGS-325): Caddyfile, caddy-run.sh, plist template, install.sh.
// Run: CADDY_BIN=/path/to/caddy node scripts/caddy/test-config.mjs
// Throwaway Caddy only on 127.0.0.1 high ports with skip_install_trust. Never touches the depot, a service, Tailscale Serve or pf.
import http from 'node:http'
import https from 'node:https'
import os from 'node:os'
import net from 'node:net'
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CADDY = process.env.CADDY_BIN
if (!CADDY) { console.error('set CADDY_BIN'); process.exit(2) }
const DUMMY = { ...process.env, CLOUDFLARE_API_TOKEN: 'a'.repeat(40) }
const tmp = mkdtempSync(join(os.tmpdir(), 'caddy-config-test-'))
let failed = 0
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${ok ? '' : extra}`); if (!ok) failed++ }
const read = f => readFileSync(join(HERE, f), 'utf8')
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts })

// ---- Caddyfile
const cf = join(HERE, 'Caddyfile')
check('Caddyfile exists', existsSync(cf))
if (existsSync(cf)) {
  const v = run(CADDY, ['validate', '--config', cf, '--adapter', 'caddyfile'], { env: DUMMY })
  check('caddy validate passes', v.status === 0, v.stderr.slice(-300))
  const adapted = JSON.parse(run(CADDY, ['adapt', '--config', cf, '--adapter', 'caddyfile'], { env: DUMMY }).stdout || '{}')
  const servers = Object.values(adapted.apps?.http?.servers ?? {})
  const listens = servers.flatMap(s => s.listen ?? [])
  check('every listen address is 127.0.0.1:8443', listens.length > 0 && listens.every(l => l === '127.0.0.1:8443'), JSON.stringify(listens))
  const hosts = servers.flatMap(s => s.routes ?? []).flatMap(r => (r.match ?? []).flatMap(m => m.host ?? [])).sort()
  check('exactly the three host names', JSON.stringify(hosts) === JSON.stringify(['opencode.pazurite.com', 'pazurite.com', 'workbox.tail730dcf.ts.net']), JSON.stringify(hosts))
  const json = JSON.stringify(adapted)
  check('no port 80 and no 0.0.0.0', !/:80"|0\.0\.0\.0/.test(json))
  check('OpenCode names proxy to 127.0.0.1:4198', (json.match(/127\.0\.0\.1:4198/g) ?? []).length === 2)
  check('apex has no reverse_proxy', !/"host":\["pazurite\.com"\][^]*?4300/.test(json))

  // route table by SNI against a stub backend
  const BACK = 18510, FRONT = 18444
  const src = readFileSync(cf, 'utf8')
    .replace(/tls \{\n\t\t[^\n]*\n\t\}/g, 'tls internal')
    .replace('https_port 8443', `https_port ${FRONT}\n\tskip_install_trust`)
    .replaceAll('127.0.0.1:4198', `127.0.0.1:${BACK}`)
  const tcf = join(tmp, 'Caddyfile'); writeFileSync(tcf, src)
  const stub = http.createServer((q, r) => r.end('stub-ok'))
  await new Promise(r => stub.listen(BACK, '127.0.0.1', r))
  const caddy = spawn(CADDY, ['run', '--config', tcf, '--adapter', 'caddyfile'], { env: { ...DUMMY, XDG_DATA_HOME: join(tmp, 'data'), XDG_CONFIG_HOME: join(tmp, 'cfg') }, stdio: ['ignore', 'ignore', 'pipe'] })
  let log = ''; caddy.stderr.on('data', d => { log += d })
  for (let i = 0; i < 50; i++) { if (await new Promise(ok => { const s = net.connect(FRONT, '127.0.0.1'); s.on('connect', () => { s.destroy(); ok(true) }); s.on('error', () => ok(false)) })) break; await new Promise(r => setTimeout(r, 200)) }
  const get = (host, path) => new Promise(ok => https.get({ host: '127.0.0.1', port: FRONT, path, servername: host, rejectUnauthorized: false, headers: { host } }, res => { let b = ''; res.on('data', d => { b += d }); res.on('end', () => ok([res.statusCode, b])) }).on('error', e => ok([0, e.message])))
  for (let i = 0; i < 50; i++) { const [c] = await get('pazurite.com', '/'); if (c) break; await new Promise(r => setTimeout(r, 200)) }   // certificates are issued after the listener is up
  for (const p of ['/', '/api/v1/anything', '/api/anything']) { const [c, b] = await get("pazurite.com", p); check(`pazurite.com${p} -> 404`, c === 404, `got ${c} ${b}`) }
  for (const h of ['opencode.pazurite.com', 'workbox.tail730dcf.ts.net']) { const [c, b] = await get(h, '/'); check(`${h}/ -> stub 200`, c === 200 && b === 'stub-ok', `got ${c} ${b}`) }
  check('test Caddy tried no sudo or trust-store install', !/sudo|installing root certificate/.test(log))
  caddy.kill('SIGTERM'); stub.close()
}

// ---- plist template
const plist = join(HERE, 'com.jazurite.digismith.caddy.plist.tmpl')
check('plist template exists', existsSync(plist))
if (existsSync(plist)) {
  const t = read('com.jazurite.digismith.caddy.plist.tmpl')
  check('plist has the label, RunAtLoad, KeepAlive, @DEPOT@ paths', /com\.jazurite\.digismith\.caddy/.test(t) && /RunAtLoad/.test(t) && /KeepAlive/.test(t) && /@DEPOT@\/bin\/caddy-run/.test(t))
}

// ---- caddy-run.sh passes Caddy only its own variables
const runner = join(HERE, 'caddy-run.sh')
check('caddy-run.sh exists', existsSync(runner))
if (existsSync(runner)) {
  const dep = join(tmp, 'run-depot'); mkdirSync(join(dep, 'bin'), { recursive: true }); mkdirSync(join(dep, 'caddy'), { recursive: true })
  writeFileSync(join(dep, '.env'), 'OTHER_SECRET=nope\nCLOUDFLARE_API_TOKEN=tok123\nNEXUS_BASIC_AUTH_HASH=$2a$14$abc\n')
  writeFileSync(join(dep, 'bin', 'caddy'), '#!/bin/sh\nenv | grep -E "^(CLOUDFLARE_API_TOKEN|NEXUS_BASIC_AUTH_HASH|XDG_DATA_HOME|OTHER_SECRET)=" | sed "s/=.*/ set/"\necho "args: $*"\n')
  chmodSync(join(dep, 'bin', 'caddy'), 0o755)
  const r = run('sh', [runner], { env: { PATH: process.env.PATH, HOME: tmp, DIGISMITH_DEPOT: dep } })
  check('caddy-run.sh gives Caddy the token, the hash and a data dir', /CLOUDFLARE_API_TOKEN set/.test(r.stdout) && /NEXUS_BASIC_AUTH_HASH set/.test(r.stdout) && /XDG_DATA_HOME set/.test(r.stdout), r.stdout + r.stderr)
  check('caddy-run.sh does not pass other .env values', !/OTHER_SECRET/.test(r.stdout))
  check('caddy-run.sh runs the depot Caddyfile', /args: run --config .*caddy\/Caddyfile --adapter caddyfile/.test(r.stdout), r.stdout)
}

// ---- install.sh into a temp depot with a local fake binary
const inst = join(HERE, 'install.sh')
check('install.sh exists', existsSync(inst))
if (existsSync(inst)) {
  const fake = join(tmp, 'fake-caddy'); writeFileSync(fake, '#!/bin/sh\necho fake\n')
  const sha = createHash('sha256').update(readFileSync(fake)).digest('hex')
  const env = (dep, s) => ({ PATH: process.env.PATH, HOME: tmp, DEPOT: dep, CADDY_URL: `file://${fake}`, CADDY_SHA256: s })
  const dep = join(tmp, 'inst-depot')
  const ok = run('sh', [inst], { env: env(dep, sha) })
  check('install.sh succeeds with a matching hash', ok.status === 0, ok.stdout + ok.stderr)
  check('depot has bin/caddy (755), bin/caddy-run, caddy/Caddyfile', existsSync(join(dep, 'bin/caddy')) && (statSync(join(dep, 'bin/caddy')).mode & 0o777) === 0o755 && existsSync(join(dep, 'bin/caddy-run')) && existsSync(join(dep, 'caddy/Caddyfile')))
  const pl = join(dep, 'caddy/com.jazurite.digismith.caddy.plist')
  check('rendered plist has no placeholder and passes plutil', existsSync(pl) && !/@DEPOT@/.test(readFileSync(pl, 'utf8')) && run('plutil', ['-lint', pl]).status === 0)
  check('install.sh loads no service and writes no LaunchAgents', !/launchctl|LaunchAgents/.test(readFileSync(inst, 'utf8').replace(/^\s*#.*$/gm, '').replace(/echo[^\n]*\n/g, '')) )
  const dep2 = join(tmp, 'inst-depot2')
  const bad = run('sh', [inst], { env: env(dep2, '0'.repeat(64)) })
  check('install.sh refuses a hash mismatch and leaves no bin/caddy', bad.status !== 0 && !existsSync(join(dep2, 'bin/caddy')), bad.stdout + bad.stderr)
}

// ---- no script prints .env
for (const f of ['caddy-run.sh', 'install.sh']) {
  if (!existsSync(join(HERE, f))) continue
  const code = read(f).replace(/^\s*#.*$/gm, '')
  check(`${f} never prints .env`, !/(cat|echo|printf|less|head|tail)[^\n|]*\.env/.test(code))
}
process.exit(failed ? 1 : 0)
