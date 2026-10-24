import { mkdirSync, mkdtempSync, readFileSync, realpathSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSnapshotStore, snapshotDir, webRootsOf } from './oculus-snapshot.ts'

const agent = { name: 'dgs-599', pane: 'w2:p5', tab: 'w2:t5', workspace: 'w2', role: 'builder', project: 'DigiSmith', status: 'working', run: null } as const
const depot = () => {
  const d = mkdtempSync(join(tmpdir(), 'oc-snap-'))
  mkdirSync(join(d, 'nexus', 'www.d', '1'), { recursive: true }); symlinkSync('www.d/1', join(d, 'nexus', 'www'))
  mkdirSync(join(d, 'nexus', 'oculus.d', '1'), { recursive: true }); symlinkSync('oculus.d/1', join(d, 'nexus', 'oculus'))
  return d
}
const under = (child: string, parent: string) => (child + sep).startsWith(parent + sep)

describe('snapshot store', () => {
  it('saves atomically to nexus/state/oculus-live-last.json with folder 700 and file 600, and loads it back', () => {
    const d = depot(); const s = createSnapshotStore(snapshotDir(d), { webRoots: webRootsOf(d) })
    expect(s.save({ asOf: '2026-10-24T08:00:00.000Z', agents: [agent] })).toBe(true)
    const file = join(d, 'nexus', 'state', 'oculus-live-last.json')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ asOf: '2026-10-24T08:00:00.000Z', agents: [agent] })
    expect(statSync(join(d, 'nexus', 'state')).mode & 0o777).toBe(0o700)
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(s.load()).toEqual({ asOf: '2026-10-24T08:00:00.000Z', agents: [agent] })
  })
  it('the snapshot path is under neither web root (real paths)', () => {
    const d = depot()
    const dir = snapshotDir(d); mkdirSync(dir, { recursive: true })
    for (const root of webRootsOf(d)) expect(under(realpathSync(dir), realpathSync(root))).toBe(false)
  })
  it('refuses a folder inside a web root: saves nothing, loads nothing', () => {
    const d = depot(); const inside = join(d, 'nexus', 'oculus', 'state')
    const s = createSnapshotStore(inside, { webRoots: webRootsOf(d) })
    expect(s.save({ asOf: '2026-10-24T08:00:00.000Z', agents: [agent] })).toBe(false)
    expect(s.load()).toBeNull()
  })
  it('a missing or broken file loads as null', () => {
    const d = depot(); const s = createSnapshotStore(snapshotDir(d), { webRoots: webRootsOf(d) })
    expect(s.load()).toBeNull()
    mkdirSync(snapshotDir(d), { recursive: true }); writeFileSync(join(snapshotDir(d), 'oculus-live-last.json'), '{"asOf":1}')
    expect(s.load()).toBeNull()
  })
  it('never writes a field outside the schema', () => {
    const d = depot(); const s = createSnapshotStore(snapshotDir(d), { webRoots: webRootsOf(d) })
    expect(s.save({ asOf: '2026-10-24T08:00:00.000Z', agents: [{ ...agent, terminal_title: 'x' } as never] })).toBe(false)
  })
})
