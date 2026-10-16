import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { sudoersLine } from './src/command.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const sh = (args: string[], env: Record<string, string>) => spawnSync('sh', args, { encoding: 'utf8', env: { PATH: process.env.PATH ?? '', ...env } })

describe('install.sh', () => {
  const home = mkdtempSync(join(tmpdir(), 'nexus-install-home-'))
  const depot = join(home, 'depot')
  const r = sh([join(HERE, 'install.sh')], { HOME: home, DEPOT: depot, DGS_SKIP_PNPM: '1' })
  const user = spawnSync('id', ['-un'], { encoding: 'utf8' }).stdout.trim()

  it('succeeds and writes the depot files', () => {
    expect(r.status, r.stdout + r.stderr).toBe(0)
    for (const f of ['nexus-api/src/server.ts', 'nexus-api/src/command.ts', 'nexus-api/package.json', 'bin/nexus-api', 'nexus/com.jazurite.digismith.nexus-api.plist', 'nexus/digismith-nexus.sudoers']) expect(existsSync(join(depot, f)), f).toBe(true)
    expect(statSync(join(depot, 'bin/nexus-api')).mode & 0o777).toBe(0o755)
  })
  it('copies no tests and no fixtures into the depot', () => {
    expect(readdirSync(join(depot, 'nexus-api/src')).filter(f => f.endsWith('.test.ts') || f === 'fixtures')).toEqual([])
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
