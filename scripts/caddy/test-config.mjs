// Tests for the Caddy front door files (DGS-325): Caddyfile, caddy-run.sh, plist template, install.sh.
// Run: CADDY_BIN=/path/to/caddy node scripts/caddy/test-config.mjs
// Throwaway Caddy only on 127.0.0.1 high ports with skip_install_trust. Never touches the depot, a service, Tailscale Serve or pf.
import http from 'node:http'
import https from 'node:https'
import os from 'node:os'
import net from 'node:net'
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, lstatSync, readlinkSync, symlinkSync, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
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
  check('exactly the three host names (no ts.net name)', JSON.stringify(hosts) === JSON.stringify(['oculus.pazurite.com', 'opencode.pazurite.com', 'pazurite.com']), JSON.stringify(hosts))
  check('no Tailscale certificate getter', !JSON.stringify(adapted).includes('tailscale'))
  const json = JSON.stringify(adapted)
  check('no port 80 and no 0.0.0.0', !/:80"|0\.0\.0\.0/.test(json))
  check('OpenCode names proxy to 127.0.0.1:4198', (json.match(/127\.0\.0\.1:4198/g) ?? []).length === 1)
  const apex = servers.flatMap(s => s.routes ?? []).filter(r => (r.match ?? []).some(m => (m.host ?? []).includes('pazurite.com')))
  check('apex route exists', apex.length === 1)
  const apexJson = JSON.stringify(apex[0] ?? {})
  check('apex proxies only /api/* to 127.0.0.1:4300', (apexJson.match(/reverse_proxy/g) ?? []).length === 1 && apexJson.includes('127.0.0.1:4300') && apexJson.includes('/api/*') && apexJson.includes('file_server'))
  const oc = servers.flatMap(s => s.routes ?? []).filter(r => (r.match ?? []).some(m => (m.host ?? []).includes('oculus.pazurite.com')))
  const ocJson = JSON.stringify(oc)
  check('oculus route exists', oc.length === 1)
  check('oculus proxies only /api/* to 127.0.0.1:4300 and serves files from DIGISMITH_OCULUS_WWW', (ocJson.match(/reverse_proxy/g) ?? []).length === 1 && ocJson.includes('127.0.0.1:4300') && ocJson.includes('/api/*') && ocJson.includes('file_server') && ocJson.includes('DIGISMITH_OCULUS_WWW'))
  check('no redirect from /nightwatch', !/nightwatch/.test(json))
  check('no login anywhere: no basic_auth in the config (login design: DGS-458)', !/http_basic|basic_auth/.test(json))

  // route table by SNI against a stub backend
  const BACK = 18510, BACK2 = 18511, FRONT = 18444
  const src = readFileSync(cf, 'utf8')
    .replace(/tls \{\n\t\t[^\n]*\n\t\}/g, 'tls internal')
    .replace('https_port 8443', `https_port ${FRONT}\n\tskip_install_trust`)
    .replaceAll('127.0.0.1:4198', `127.0.0.1:${BACK}`)
    .replaceAll('127.0.0.1:4300', `127.0.0.1:${BACK2}`)
  const tcf = join(tmp, 'Caddyfile'); writeFileSync(tcf, src)
  const www = join(tmp, '.digismith-depot-like', 'nexus', 'www')   // under a dot-folder, like the real ~/.digismith-depot/nexus/www (DGS-481 first deploy: `hide .*` made every file 404)
  mkdirSync(join(www, '_nuxt'), { recursive: true }); mkdirSync(join(www, 'storybook/assets'), { recursive: true }); mkdirSync(join(www, 'storybook/_nuxt'), { recursive: true })
  const big = '<!doctype html><title>x</title>' + '<p>padding</p>'.repeat(120)   // over Caddy's compression minimum
  writeFileSync(join(www, 'index.html'), big); writeFileSync(join(www, '_nuxt/app.abc123.js'), 'console.log(1)\n'.repeat(80))
  writeFileSync(join(www, 'storybook/index.html'), big); writeFileSync(join(www, 'storybook/assets/x-abc123.js'), 'console.log(2)\n'.repeat(80)); writeFileSync(join(www, 'storybook/_nuxt/y.def456.js'), 'console.log(3)\n'.repeat(80))
  const ocwww = join(tmp, '.digismith-depot-like', 'nexus', 'oculus')
  mkdirSync(join(ocwww, '_nuxt'), { recursive: true })
  writeFileSync(join(ocwww, 'index.html'), '<!doctype html><title>oc</title>' + '<p>padding</p>'.repeat(120))
  writeFileSync(join(ocwww, '_nuxt/oc.abc123.js'), 'console.log(4)\n'.repeat(80))
  const stub = http.createServer((q, r) => r.end('stub-ok'))
  await new Promise(r => stub.listen(BACK, '127.0.0.1', r))
  const api = http.createServer((q, r) => r.end(`api-ok ${q.url} auth-header-seen-by-api=${q.headers.authorization ? 'yes' : 'no'}`))
  await new Promise(r => api.listen(BACK2, '127.0.0.1', r))
  const caddy = spawn(CADDY, ['run', '--config', tcf, '--adapter', 'caddyfile'], { env: { ...DUMMY, DIGISMITH_WWW: www, DIGISMITH_OCULUS_WWW: ocwww, XDG_DATA_HOME: join(tmp, 'data'), XDG_CONFIG_HOME: join(tmp, 'cfg') }, stdio: ['ignore', 'ignore', 'pipe'] })
  process.on('exit', () => caddy.kill('SIGTERM'))
  let log = ''; caddy.stderr.on('data', d => { log += d })
  for (let i = 0; i < 50; i++) { if (await new Promise(ok => { const s = net.connect(FRONT, '127.0.0.1'); s.on('connect', () => { s.destroy(); ok(true) }); s.on('error', () => ok(false)) })) break; await new Promise(r => setTimeout(r, 200)) }
  const get = (host, path, auth, extra = {}) => new Promise(ok => https.get({ host: '127.0.0.1', port: FRONT, path, servername: host, rejectUnauthorized: false, headers: { host, ...extra, ...(auth ? { authorization: 'Basic ' + Buffer.from(auth).toString('base64') } : {}) } }, res => { let b = ''; res.on('data', d => { b += d }); res.on('end', () => ok([res.statusCode, b, res.headers])) }).on('error', e => ok([0, e.message])))
  for (let i = 0; i < 50; i++) { const [c] = await get('pazurite.com', '/'); if (c) break; await new Promise(r => setTimeout(r, 200)) }   // certificates are issued after the listener is up
  { const [c, b, h] = await get('pazurite.com', '/'); check('pazurite.com/ serves the page', c === 200 && b.includes('<title>x</title>'), `got ${c}`); check('index.html is sent no-cache', h?.['cache-control'] === 'no-cache', JSON.stringify(h?.['cache-control'])) }
  { const [c, , h] = await get('pazurite.com', '/_nuxt/app.abc123.js'); check('hashed page asset is immutable for a year', c === 200 && h['cache-control'] === 'public, max-age=31536000, immutable', JSON.stringify(h?.['cache-control'])) }
  { const [c, b, h] = await get('pazurite.com', '/storybook/'); check('/storybook/ serves Storybook, no-cache', c === 200 && b.includes('<title>x</title>') && h['cache-control'] === 'no-cache', `got ${c}`) }
  { const [c, , h] = await get('pazurite.com', '/storybook'); check('/storybook redirects to /storybook/', c >= 300 && c < 400 && String(h.location).endsWith('/storybook/'), `got ${c} ${h?.location}`) }
  { const [c, , h] = await get('pazurite.com', '/storybook/assets/x-abc123.js'); check('Storybook hashed asset is immutable', c === 200 && h['cache-control'] === 'public, max-age=31536000, immutable', JSON.stringify(h?.['cache-control'])) }
  { const [c, , h] = await get('pazurite.com', '/storybook/_nuxt/y.def456.js'); check('Storybook /_nuxt hashed asset is immutable', c === 200 && h['cache-control'] === 'public, max-age=31536000, immutable', `got ${c} ${JSON.stringify(h?.['cache-control'])}`) }
  { const [c, , h] = await get('pazurite.com', '/', undefined, { 'accept-encoding': 'gzip' }); check('the page is compressed', c === 200 && /gzip|zstd/.test(String(h['content-encoding'])), JSON.stringify(h?.['content-encoding'])) }
  { const [c] = await get('pazurite.com', '/missing.html'); check('an unknown file is 404', c === 404, `got ${c}`) }
  for (const p of ['/api/v1/power-metrics', '/api/anything', '/api/']) {
    const [k, kb] = await get('pazurite.com', p); check(`pazurite.com${p} -> API stub 200, no login`, k === 200 && kb.startsWith(`api-ok ${p}`), `got ${k} ${kb}`)
  }
  { const [, kb] = await get('pazurite.com', '/api/v1/power-metrics', 'jack:whatever'); check('an Authorization header sent by a client never reaches the API', kb.endsWith('auth-header-seen-by-api=no'), kb) }
  { const [c, b] = await get('pazurite.com', '/other'); check('pazurite.com/other -> 404', c === 404, `got ${c} ${b}`) }
  { const [c] = await get('opencode.pazurite.com', '/'); check('opencode.pazurite.com/ -> 200', c === 200, `got ${c}`) }
  for (const h of ['opencode.pazurite.com']) { const [c, b] = await get(h, '/'); check(`${h}/ -> stub 200`, c === 200 && b === 'stub-ok', `got ${c} ${b}`) }
  { const [c, b, h] = await get('oculus.pazurite.com', '/'); check('oculus.pazurite.com/ serves the Oculus page, no-cache', c === 200 && b.includes('<title>oc</title>') && h['cache-control'] === 'no-cache', `got ${c}`) }
  { const [c, , h] = await get('oculus.pazurite.com', '/_nuxt/oc.abc123.js'); check('Oculus hashed asset is immutable', c === 200 && h['cache-control'] === 'public, max-age=31536000, immutable', `got ${c}`) }
  { const [, kb] = await get('oculus.pazurite.com', '/api/v1/oculus/overview', 'jack:whatever'); check('oculus /api/* reaches the API without the Authorization header', kb.startsWith('api-ok /api/v1/oculus/overview') && kb.endsWith('auth-header-seen-by-api=no'), kb) }
  { const [c, b] = await get('pazurite.com', '/'); check('pazurite.com/ still serves the Life page', c === 200 && b.includes('<title>x</title>'), `got ${c}`) }
  { const [c] = await get('pazurite.com', '/nightwatch/'); check('pazurite.com/nightwatch/ is 404 (no redirect)', c === 404, `got ${c}`) }
  { const [c] = await get('oculus.pazurite.com', '/missing.html'); check('an unknown Oculus file is 404', c === 404, `got ${c}`) }
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
  writeFileSync(join(dep, '.env'), 'OTHER_SECRET=nope\nCLOUDFLARE_API_TOKEN=tok123\n')
  writeFileSync(join(dep, 'bin', 'caddy'), '#!/bin/sh\nenv | grep -E "^(CLOUDFLARE_API_TOKEN|NEXUS_BASIC_AUTH_HASH|XDG_DATA_HOME|DIGISMITH_WWW|DIGISMITH_OCULUS_WWW|OTHER_SECRET)=" | sed "s/=.*/ set/"\necho "args: $*"\n')
  chmodSync(join(dep, 'bin', 'caddy'), 0o755)
  const r = run('sh', [runner], { env: { PATH: process.env.PATH, HOME: tmp, DIGISMITH_DEPOT: dep } })
  check('caddy-run.sh gives Caddy the token and a data dir, and no login hash', /CLOUDFLARE_API_TOKEN set/.test(r.stdout) && !/NEXUS_BASIC_AUTH_HASH/.test(r.stdout) && /XDG_DATA_HOME set/.test(r.stdout), r.stdout + r.stderr)
  check('caddy-run.sh gives Caddy the web root', /DIGISMITH_WWW set/.test(r.stdout), r.stdout)
  check('caddy-run.sh makes www a relative symlink to an empty placeholder build folder, not a real directory', lstatSync(join(dep, 'nexus', 'www')).isSymbolicLink() && readlinkSync(join(dep, 'nexus', 'www')) === 'www.d/empty' && statSync(join(dep, 'nexus', 'www')).isDirectory())
  check('caddy-run.sh gives Caddy the Oculus web root', /DIGISMITH_OCULUS_WWW set/.test(r.stdout), r.stdout)
  check('caddy-run.sh makes oculus a relative symlink to an empty placeholder build folder', lstatSync(join(dep, 'nexus', 'oculus')).isSymbolicLink() && readlinkSync(join(dep, 'nexus', 'oculus')) === 'oculus.d/empty' && statSync(join(dep, 'nexus', 'oculus')).isDirectory())
  check('caddy-run.sh does not pass other .env values', !/OTHER_SECRET/.test(r.stdout))
  writeFileSync(join(dep, '.env'), 'CLOUDFLARE_API_TOKEN=tok123\nNEXUS_BASIC_AUTH_HASH=$2a$14$leftover\n')   // an old line in .env is not passed on either
  { const dep2 = join(tmp, 'run-depot2'); mkdirSync(join(dep2, 'bin'), { recursive: true }); mkdirSync(join(dep2, 'caddy'), { recursive: true }); writeFileSync(join(dep2, '.env'), 'CLOUDFLARE_API_TOKEN=tok123\n'); writeFileSync(join(dep2, 'nexus'), 'a file, not a directory'); writeFileSync(join(dep2, 'bin', 'caddy'), '#!/bin/sh\necho started\n'); chmodSync(join(dep2, 'bin', 'caddy'), 0o755)
    const bad = run('sh', [runner], { env: { PATH: process.env.PATH, HOME: tmp, DIGISMITH_DEPOT: dep2 } })
    check('caddy-run.sh refuses to start Caddy without a web root directory', bad.status !== 0 && !/started/.test(bad.stdout), bad.stdout + bad.stderr) }
  { const dep3 = join(tmp, 'run-depot3'); mkdirSync(join(dep3, 'bin'), { recursive: true }); mkdirSync(join(dep3, 'caddy'), { recursive: true }); mkdirSync(join(dep3, 'nexus', 'www.d', 'empty'), { recursive: true }); writeFileSync(join(dep3, '.env'), 'CLOUDFLARE_API_TOKEN=tok123\n'); symlinkSync('www.d/empty', join(dep3, 'nexus', 'www')); symlinkSync('oculus.d/missing', join(dep3, 'nexus', 'oculus')); writeFileSync(join(dep3, 'bin', 'caddy'), '#!/bin/sh\necho started\n'); chmodSync(join(dep3, 'bin', 'caddy'), 0o755)
    const bad3 = run('sh', [runner], { env: { PATH: process.env.PATH, HOME: tmp, DIGISMITH_DEPOT: dep3 } })
    check('caddy-run.sh refuses to start Caddy without an Oculus web root directory', bad3.status !== 0 && !/started/.test(bad3.stdout), bad3.stdout + bad3.stderr) }
  const old = run('sh', [runner], { env: { PATH: process.env.PATH, HOME: tmp, DIGISMITH_DEPOT: dep } })
  check('caddy-run.sh ignores a leftover NEXUS_BASIC_AUTH_HASH line', !/NEXUS_BASIC_AUTH_HASH/.test(old.stdout), old.stdout)
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
