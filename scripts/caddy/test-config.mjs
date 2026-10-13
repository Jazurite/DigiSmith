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
const TEST_PW = 'nexus-test-password'
const TEST_HASH = spawnSync(CADDY, ['hash-password', '--plaintext', TEST_PW], { encoding: 'utf8' }).stdout.trim()   // dummy password, never a real login
const DUMMY = { ...process.env, CLOUDFLARE_API_TOKEN: 'a'.repeat(40), NEXUS_BASIC_AUTH_HASH: TEST_HASH }
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
  check('exactly the two host names (no ts.net name)', JSON.stringify(hosts) === JSON.stringify(['opencode.pazurite.com', 'pazurite.com']), JSON.stringify(hosts))
  check('no Tailscale certificate getter', !JSON.stringify(adapted).includes('tailscale'))
  const json = JSON.stringify(adapted)
  check('no port 80 and no 0.0.0.0', !/:80"|0\.0\.0\.0/.test(json))
  check('OpenCode names proxy to 127.0.0.1:4198', (json.match(/127\.0\.0\.1:4198/g) ?? []).length === 1)
  const apex = servers.flatMap(s => s.routes ?? []).filter(r => (r.match ?? []).some(m => (m.host ?? []).includes('pazurite.com')))
  check('apex route exists', apex.length === 1)
  const apexJson = JSON.stringify(apex[0] ?? {})
  check('apex proxies only /api/* to 127.0.0.1:4300', (apexJson.match(/reverse_proxy/g) ?? []).length === 1 && apexJson.includes('127.0.0.1:4300') && apexJson.includes('/api/*'))
  check('basic_auth sits on the apex /api/* route only, not on opencode', (json.match(/http_basic/g) ?? []).length === 1 && /http_basic/.test(apexJson) && !/opencode/.test(apexJson))

  // route table by SNI against a stub backend
  const BACK = 18510, BACK2 = 18511, FRONT = 18444
  const src = readFileSync(cf, 'utf8')
    .replace(/tls \{\n\t\t[^\n]*\n\t\}/g, 'tls internal')
    .replace('https_port 8443', `https_port ${FRONT}\n\tskip_install_trust`)
    .replaceAll('127.0.0.1:4198', `127.0.0.1:${BACK}`)
    .replaceAll('127.0.0.1:4300', `127.0.0.1:${BACK2}`)
  const tcf = join(tmp, 'Caddyfile'); writeFileSync(tcf, src)
  const stub = http.createServer((q, r) => r.end('stub-ok'))
  await new Promise(r => stub.listen(BACK, '127.0.0.1', r))
  const api = http.createServer((q, r) => r.end(`api-ok ${q.url} auth-header-seen-by-api=${q.headers.authorization ? 'yes' : 'no'}`))
  await new Promise(r => api.listen(BACK2, '127.0.0.1', r))
  const caddy = spawn(CADDY, ['run', '--config', tcf, '--adapter', 'caddyfile'], { env: { ...DUMMY, XDG_DATA_HOME: join(tmp, 'data'), XDG_CONFIG_HOME: join(tmp, 'cfg') }, stdio: ['ignore', 'ignore', 'pipe'] })
  process.on('exit', () => caddy.kill('SIGTERM'))
  let log = ''; caddy.stderr.on('data', d => { log += d })
  for (let i = 0; i < 50; i++) { if (await new Promise(ok => { const s = net.connect(FRONT, '127.0.0.1'); s.on('connect', () => { s.destroy(); ok(true) }); s.on('error', () => ok(false)) })) break; await new Promise(r => setTimeout(r, 200)) }
  const get = (host, path, auth) => new Promise(ok => https.get({ host: '127.0.0.1', port: FRONT, path, servername: host, rejectUnauthorized: false, headers: { host, ...(auth ? { authorization: 'Basic ' + Buffer.from(auth).toString('base64') } : {}) } }, res => { let b = ''; res.on('data', d => { b += d }); res.on('end', () => ok([res.statusCode, b])) }).on('error', e => ok([0, e.message])))
  for (let i = 0; i < 50; i++) { const [c] = await get('pazurite.com', '/'); if (c) break; await new Promise(r => setTimeout(r, 200)) }   // certificates are issued after the listener is up
  { const [c, b] = await get('pazurite.com', '/'); check('pazurite.com/ -> 404 (no login needed)', c === 404, `got ${c} ${b}`) }
  for (const p of ['/api/v1/power-metrics', '/api/anything', '/api/']) {
    const [c] = await get('pazurite.com', p); check(`pazurite.com${p} without credentials -> 401`, c === 401, `got ${c}`)
    const [w] = await get('pazurite.com', p, 'jack:wrong'); check(`pazurite.com${p} with a wrong password -> 401`, w === 401, `got ${w}`)
    const [u] = await get('pazurite.com', p, `root:${TEST_PW}`); check(`pazurite.com${p} with a wrong user -> 401`, u === 401, `got ${u}`)
    const [k, kb] = await get('pazurite.com', p, `jack:${TEST_PW}`); check(`pazurite.com${p} with the right login -> API stub 200`, k === 200 && kb.startsWith(`api-ok ${p}`), `got ${k} ${kb}`)
  }
  { const [, kb] = await get('pazurite.com', '/api/v1/power-metrics', `jack:${TEST_PW}`); check('the API never sees the Authorization header', kb.endsWith('auth-header-seen-by-api=no'), kb) }
  { const [c, b] = await get('pazurite.com', '/other', `jack:${TEST_PW}`); check('pazurite.com/other with credentials -> 404', c === 404, `got ${c} ${b}`) }
  { const [c] = await get('opencode.pazurite.com', '/'); check('opencode.pazurite.com/ needs no basic auth', c === 200, `got ${c}`) }
  for (const h of ['opencode.pazurite.com']) { const [c, b] = await get(h, '/'); check(`${h}/ -> stub 200`, c === 200 && b === 'stub-ok', `got ${c} ${b}`) }
  check('test Caddy tried no sudo or trust-store install', !/sudo|installing root certificate/.test(log))
  caddy.kill('SIGTERM'); stub.close(); api.close()
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
  writeFileSync(join(dep, 'bin', 'caddy'), '#!/bin/sh\n[ "$1" = hash-password ] && { echo \'$2a$14$fakehashfakehash\'; exit 0; }\nenv | grep -E "^(CLOUDFLARE_API_TOKEN|NEXUS_BASIC_AUTH_HASH|XDG_DATA_HOME|OTHER_SECRET)=" | sed "s/=.*/ set/"\necho "args: $*"\n')
  chmodSync(join(dep, 'bin', 'caddy'), 0o755)
  const r = run('sh', [runner], { env: { PATH: process.env.PATH, HOME: tmp, DIGISMITH_DEPOT: dep } })
  check('caddy-run.sh gives Caddy the token, the hash and a data dir', /CLOUDFLARE_API_TOKEN set/.test(r.stdout) && /NEXUS_BASIC_AUTH_HASH set/.test(r.stdout) && /XDG_DATA_HOME set/.test(r.stdout), r.stdout + r.stderr)
  check('caddy-run.sh does not pass other .env values', !/OTHER_SECRET/.test(r.stdout))
  writeFileSync(join(dep, '.env'), 'CLOUDFLARE_API_TOKEN=tok123\n')
  const nohash = run('sh', [runner], { env: { PATH: process.env.PATH, HOME: tmp, DIGISMITH_DEPOT: dep } })
  writeFileSync(join(dep, 'bin', 'caddy'), '#!/bin/sh\n[ "$1" = hash-password ] && exit 1\nenv | grep -E "^NEXUS_BASIC_AUTH_HASH=" | sed "s/=.*/ set/"\n')
  const failhash = run('sh', [runner], { env: { PATH: process.env.PATH, HOME: tmp, DIGISMITH_DEPOT: dep } })
  check('caddy-run.sh still starts Caddy when hashing itself fails (fixed placeholder)', failhash.status === 0 && /NEXUS_BASIC_AUTH_HASH set/.test(failhash.stdout), failhash.stdout + failhash.stderr)
  writeFileSync(join(dep, 'bin', 'caddy'), '#!/bin/sh\n[ "$1" = hash-password ] && { echo \'$2a$14$fakehashfakehash\'; exit 0; }\nenv | grep -E "^(CLOUDFLARE_API_TOKEN|NEXUS_BASIC_AUTH_HASH|XDG_DATA_HOME|OTHER_SECRET)=" | sed "s/=.*/ set/"\necho "args: $*"\n')
  check('caddy-run.sh without a hash still starts Caddy, with an unguessable placeholder, and says so', nohash.status === 0 && /NEXUS_BASIC_AUTH_HASH set/.test(nohash.stdout) && /rejects every login/.test(nohash.stderr), nohash.stdout + nohash.stderr)
  check('caddy-run.sh runs the depot Caddyfile', /args: run --config .*caddy\/Caddyfile --adapter caddyfile/.test(r.stdout), r.stdout)
}

// ---- install.sh into a temp depot with a local fake binary
const inst = join(HERE, 'install.sh')
check('install.sh exists', existsSync(inst))
if (existsSync(inst)) {
  const fake = join(tmp, 'fake-caddy'); writeFileSync(fake, '#!/bin/sh\necho fake\n')
  const sha = createHash('sha256').update(readFileSync(fake)).digest('hex')
  const env = (dep, s) => ({ PATH: process.env.PATH, HOME: tmp, DEPOT: dep, CADDY_URL: `file://${fake}`, CADDY_SHA256: s, DGS_CADDY_TEST: '1' })
  const dep = join(tmp, 'inst-depot')
  const ok = run('sh', [inst], { env: env(dep, sha) })
  check('install.sh succeeds with a matching hash', ok.status === 0, ok.stdout + ok.stderr)
  check('depot has bin/caddy (755), bin/caddy-run, caddy/Caddyfile', existsSync(join(dep, 'bin/caddy')) && (statSync(join(dep, 'bin/caddy')).mode & 0o777) === 0o755 && existsSync(join(dep, 'bin/caddy-run')) && existsSync(join(dep, 'caddy/Caddyfile')))
  const pl = join(dep, 'caddy/com.jazurite.digismith.caddy.plist')
  check('rendered plist has no placeholder and passes plutil', existsSync(pl) && !/@DEPOT@/.test(readFileSync(pl, 'utf8')) && run('plutil', ['-lint', pl]).status === 0)
  check('install.sh loads no service and writes no LaunchAgents', !/launchctl|LaunchAgents/.test(readFileSync(inst, 'utf8').replace(/^\s*#.*$/gm, '').replace(/echo[^\n]*\n/g, '')) )
  const ign = run('sh', [inst], { env: { PATH: process.env.PATH, HOME: tmp, DEPOT: join(tmp, 'inst-depot3'), CADDY_URL: `file://${fake}`, CADDY_SHA256: sha } })
  check('install.sh ignores CADDY_URL and CADDY_SHA256 without DGS_CADDY_TEST', ign.status !== 0 || !existsSync(join(tmp, 'inst-depot3/bin/caddy')) || run('shasum', ['-a', '256', join(tmp, 'inst-depot3/bin/caddy')]).stdout.startsWith('f7f2a3cb'), ign.stdout + ign.stderr)
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
