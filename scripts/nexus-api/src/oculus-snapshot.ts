// scripts/nexus-api/src/oculus-snapshot.ts
// DGS-599: the last good herdr agent list, so Oculus can show it (marked disconnected) during a herdr outage, also on a fresh page load.
// Lives in $DEPOT/nexus/state/, never under a web root (nexus/www, nexus/oculus are what Caddy serves and build-www.sh switches).
import { chmodSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { liveSnapshotSchema, type LiveAgent } from '../../nexus-shared/oculus.ts'

export interface Snapshot { asOf: string; agents: LiveAgent[] }
export interface SnapshotStore { save(s: Snapshot): boolean; load(): Snapshot | null }

const FILE = 'oculus-live-last.json'
export const snapshotDir = (depot: string): string => join(depot, 'nexus', 'state')
export const webRootsOf = (depot: string): string[] => [join(depot, 'nexus', 'www'), join(depot, 'nexus', 'oculus')]

// the nearest existing folder, resolved, so a symlinked web root cannot hide a path inside it
function real(p: string): string {
  let cur = resolve(p); const rest: string[] = []
  for (;;) {
    try { return join(realpathSync(cur), ...rest.reverse()) } catch { /* not there yet */ }
    const up = dirname(cur); if (up === cur) return resolve(p)
    rest.push(cur.slice(up.length + 1)); cur = up
  }
}
const inside = (child: string, parent: string): boolean => (child + sep).startsWith(parent + sep)

export function createSnapshotStore(dir: string, opts: { webRoots?: string[] } = {}): SnapshotStore {
  const blocked = (opts.webRoots ?? []).some((r) => inside(real(dir), real(r)))
  const file = join(dir, FILE)
  return {
    save(s) {
      if (blocked) return false
      const parsed = liveSnapshotSchema.safeParse(s)
      if (!parsed.success) return false
      try {
        mkdirSync(dir, { recursive: true, mode: 0o700 }); chmodSync(dir, 0o700)
        const tmp = `${file}.${process.pid}.tmp`
        writeFileSync(tmp, JSON.stringify(parsed.data), { mode: 0o600 })
        renameSync(tmp, file)
        return true
      } catch { return false }
    },
    load() {
      if (blocked) return null
      try { const p = liveSnapshotSchema.safeParse(JSON.parse(readFileSync(file, 'utf8'))); return p.success ? p.data : null } catch { return null }
    },
  }
}
