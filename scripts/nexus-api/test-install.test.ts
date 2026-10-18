import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer } from 'node:net'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, realpathSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { sudoersLine } from './src/command.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const sh = (args: string[], env: Record<string, string>) => spawnSync('sh', args, { encoding: 'utf8', env: { PATH: process.env.PATH ?? '', ...env } })

const freePort = () => new Promise<number>((res, rej) => {
  const s = createServer()
  s.once('error', rej)
  s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)) })
})

describe('install.sh', () => {
  const home = mkdtempSync(join(tmpdir(), 'nexus-install-home-'))
  const depot = join(home, 'depot')
  const r = sh([join(HERE, 'install.sh')], { HOME: home, DEPOT: depot, DGS_SKIP_PNPM: '1' })
  const user = spawnSync('id', ['-un'], { encoding: 'utf8' }).stdout.trim()

  it('succeeds and writes the depot files', () => {
    expect(r.status, r.stdout + r.stderr).toBe(0)
    for (const f of ['nexus-api/src/server.ts', 'nexus-api/src/command.ts', 'nexus-api/package.json', 'nexus-shared/days.ts', 'nexus-shared/life-calendar.ts', 'nexus-api/seed-profile.ts','bin/nexus-api', 'nexus/com.jazurite.digismith.nexus-api.plist', 'nexus/digismith-nexus.sudoers']) expect(existsSync(join(depot, f)), f).toBe(true)
    expect(statSync(join(depot, 'bin/nexus-api')).mode & 0o777).toBe(0o755)
  })
  it('creates the scheduler state folder with no token inside', () => {
    const dir = join(depot, 'nexus/scheduler')
    expect(existsSync(dir) && statSync(dir).isDirectory()).toBe(true)
    expect(readdirSync(dir)).toEqual([])
  })
  it('copies no tests and no fixtures into the depot', () => {
    expect(readdirSync(join(depot, 'nexus-api/src')).filter(f => f.endsWith('.test.ts') || f === 'fixtures')).toEqual([])
  })
  it('copies no tests into nexus-shared', () => {
    expect(readdirSync(join(depot, 'nexus-shared')).filter(f => f.endsWith('.test.ts'))).toEqual([])
  })
  it('a second run is idempotent and keeps nexus-shared/node_modules a symlink', () => {
    const again = sh([join(HERE, 'install.sh')], { HOME: home, DEPOT: depot, DGS_SKIP_PNPM: '1' })
    expect(again.status, again.stderr).toBe(0)
    expect(readlinkSync(join(depot, 'nexus-shared/node_modules'))).toBe('../nexus-api/node_modules')
  })
  it('refuses a real directory at nexus-shared/node_modules and leaves it alone', () => {
    const h = mkdtempSync(join(tmpdir(), 'nexus-install-real-'))
    const d = join(h, 'depot')
    mkdirSync(join(d, 'nexus-shared/node_modules'), { recursive: true })
    writeFileSync(join(d, 'nexus-shared/node_modules/keep.txt'), 'keep')
    const bad = sh([join(HERE, 'install.sh')], { HOME: h, DEPOT: d, DGS_SKIP_PNPM: '1' })
    expect(bad.status).not.toBe(0)
    expect(bad.stderr).toMatch(/real directory/)
    expect(lstatSync(join(d, 'nexus-shared/node_modules')).isDirectory()).toBe(true)
    expect(readFileSync(join(d, 'nexus-shared/node_modules/keep.txt'), 'utf8')).toBe('keep')
  })
  it('wrapper has the absolute node path baked in and no placeholder', () => {
    const w = readFileSync(join(depot, 'bin/nexus-api'), 'utf8')
    expect(w).not.toMatch(/@NODE@|@DEPOT@/)
    expect(w).toMatch(/exec "\/[^"]+\/node" --experimental-strip-types ".*\/nexus-api\/src\/server\.ts"/)
  })
  it('plist is valid, has no placeholder, runs the wrapper, keeps it alive', () => {
    const p = join(depot, 'nexus/com.jazurite.digismith.nexus-api.plist')
    expect(readFileSync(p, 'utf8')).not.toContain('@DEPOT@')
    expect(spawnSync('plutil', ['-lint', p]).status).toBe(0)
    expect(readFileSync(p, 'utf8')).toMatch(/com\.jazurite\.digismith\.nexus-api[\s\S]*bin\/nexus-api[\s\S]*KeepAlive/)
  })
  it('the staged sudoers rule is exactly the rule for the fixed command, for this user, one line', () => {
    expect(readFileSync(join(depot, 'nexus/digismith-nexus.sudoers'), 'utf8')).toBe(sudoersLine(user) + '\n')
  })
  it('the depot copy serves the API (fake powermetrics, no sudo)', () => {
    symlinkSync(join(HERE, 'node_modules'), join(depot, 'nexus-api/node_modules'))
    const script = `
      import { readFileSync } from 'node:fs'
      const { createApiServer, createDefaultReader } = await import(${JSON.stringify(join(depot, 'nexus-api/src/server.ts'))})
      const real = readFileSync(${JSON.stringify(join(HERE, 'src/fixtures/powermetrics-real-sample.txt'))}, 'utf8')
      const s = createApiServer(createDefaultReader(async () => real))
      await new Promise(r => s.listen(0, '127.0.0.1', r))
      const res = await fetch('http://127.0.0.1:' + s.address().port + '/api/v1/power-metrics')
      const j = await res.json()
      console.log(JSON.stringify({ status: res.status, source: j.source.status, cpu: j.thermal.cpuDieTempC, version: j.machine.model }))
      s.close()
    `
    const out = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], { encoding: 'utf8' })
    expect(out.status, out.stderr).toBe(0)
    expect(JSON.parse(out.stdout.trim().split('\n').at(-1)!)).toEqual({ status: 200, source: 'ok', cpu: 50.33, version: 'MacBookPro16,1' })
  }, 30000)
  it('copies every non-test scheduler file and no test or fixture into the depot', () => {
    const want = readdirSync(join(HERE, 'src/scheduler')).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts')).sort()
    expect(want.length).toBeGreaterThan(0)
    const got = readdirSync(join(depot, 'nexus-api/src/scheduler')).sort()
    expect(got).toEqual(want)
    expect(got.filter(f => f.endsWith('.test.ts') || f === 'fixtures')).toEqual([])
  })
  it('the plist template is unchanged (pinned hash; a deliberate plist change updates it)', () => {
    const hash = createHash('sha256').update(readFileSync(join(HERE, 'com.jazurite.digismith.nexus-api.plist.tmpl'))).digest('hex')
    expect(hash).toBe('b8c67f78c9def9755e11331c5a185bbccfb7049c38aaa3b575da3e33462a86fb')
  })
  it('the depot copy starts on a high port and lists the jobs, with a private token file', async () => {
    const state = mkdtempSync(join(tmpdir(), 'nexus-install-state-'))
    const port = await freePort()
    expect(port).not.toBe(4300)
    const child = spawn(process.execPath, ['--experimental-strip-types', join(realpathSync(depot), 'nexus-api/src/server.ts')], {
      env: { PATH: process.env.PATH ?? '', HOME: home, DIGISMITH_DEPOT: depot, NEXUS_STATE_DIR: state, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let log = ''
    child.stdout.on('data', d => { log += d })
    child.stderr.on('data', d => { log += d })
    const exited = new Promise<void>(res => child.once('exit', () => res()))
    try {
      let res: Response | undefined
      for (let i = 0; i < 100 && !res; i++) {
        if (child.exitCode !== null) break
        res = await fetch(`http://127.0.0.1:${port}/api/v1/jobs`).catch(() => undefined)
        if (!res) await new Promise(r => setTimeout(r, 100))
      }
      if (!res) throw new Error(log)
      expect(res!.status).toBe(200)
      const text = await res!.text()
      const body = JSON.parse(text) as { generatedAt: unknown; jobs: Array<{ name: string; nextRunAt: unknown; lastRun: unknown }> }
      expect(typeof body.generatedAt).toBe('string')
      expect(Array.isArray(body.jobs)).toBe(true)
      const selftest = body.jobs.find(j => j.name === 'selftest')
      expect(selftest, text).toBeDefined()
      expect(selftest!.nextRunAt).toBeNull()
      expect(selftest!.lastRun).toBeNull()
      const tokenFile = join(state, 'token')
      expect(statSync(tokenFile).mode & 0o777).toBe(0o600)
      const token = readFileSync(tokenFile, 'utf8').trim()
      expect(token.length).toBeGreaterThan(0)
      expect(text).not.toContain(token)
    } finally {
      child.kill('SIGTERM')
      await Promise.race([exited, new Promise(r => setTimeout(r, 5000))])
      if (child.exitCode === null) child.kill('SIGKILL')
      await exited
    }
  }, 30000)
  it('install.sh never uses sudo or launchctl, and writes only under $DEPOT', () => {
    const code = readFileSync(join(HERE, 'install.sh'), 'utf8').replace(/^\s*#.*$/gm, '').replace(/echo[^\n]*\n/g, '')
    expect(code).not.toMatch(/\bsudo\b|launchctl|LaunchAgents|\/etc\//)
    expect(readdirSync(home)).toEqual(['depot'])
  })
  it.each(['"', '$', '`', '\\'])('refuses a depot path containing %s', ch => {
    const bad = sh([join(HERE, 'install.sh')], { HOME: home, DEPOT: join(home, `dep${ch}ot`) })
    expect(bad.status).not.toBe(0)
    expect(existsSync(join(home, `dep${ch}ot`))).toBe(false)
  })
  it('never prints .env', () => {
    expect(readFileSync(join(HERE, 'install.sh'), 'utf8')).not.toMatch(/(cat|echo|printf)[^\n|]*\.env/)
  })
})
