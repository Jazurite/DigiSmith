// Readings that need no root, read by the API itself (as `workbox-health` does): top, sysctl, memory_pressure, ps, lsof.
// One shared read with a 5 s cache (`top -l 2` takes about 1 s). Fixed absolute paths, execFile, never a shell.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createSingleFlight } from './source.ts'
import type { PowerMetrics } from './types.ts'

export type LiveExec = (file: string, args: string[]) => Promise<string>
export type LiveReadings = Pick<PowerMetrics, 'load' | 'memory' | 'topProcesses' | 'opencodeServer'> & { anyOk: boolean }

const OPENCODE_PORT = 4198
const execFileP = promisify(execFile)
const realExec: LiveExec = async (file, args) => (await execFileP(file, args, { timeout: 8000, maxBuffer: 1024 * 1024 })).stdout

async function attempt<T>(f: () => Promise<T>): Promise<T | null> {
  try { return await f() } catch { return null }
}
const num = (s: string | undefined): number | null => { const n = Number(s); return s !== undefined && Number.isFinite(n) ? n : null }

export function createLive(exec: LiveExec = realExec) {
  const read = async (): Promise<LiveReadings> => {
    const [top, loadavg, mem, ps, lsof] = await Promise.all([
      attempt(() => exec('/usr/bin/top', ['-l', '2', '-n', '0', '-s', '1'])),
      attempt(() => exec('/usr/sbin/sysctl', ['-n', 'vm.loadavg'])),
      attempt(() => exec('/usr/bin/memory_pressure', [])),
      attempt(() => exec('/bin/ps', ['-Ao', 'rss,%cpu,comm'])),
      attempt(() => exec('/usr/sbin/lsof', ['-nP', `-iTCP:${OPENCODE_PORT}`, '-sTCP:LISTEN', '-t'])),
    ])
    const idle = top ? [...top.matchAll(/CPU usage:.*?([\d.]+)% idle/g)].at(-1)?.[1] : undefined
    const loads = loadavg ? loadavg.replace(/[{}]/g, '').trim().split(/\s+/) : []
    const free = mem ? /memory free percentage: (\d+)%/.exec(mem)?.[1] : undefined
    const procs = (ps ?? '').split('\n').flatMap(line => {
      const m = /^\s*(\d+)\s+([\d.]+)\s+(.+?)\s*$/.exec(line)
      return m ? [{ name: m[3].split('/').pop() ?? m[3], rssMb: Math.round(Number(m[1]) / 1024), cpuPct: Number(m[2]) }] : []
    }).sort((a, b) => b.rssMb - a.rssMb).slice(0, 5)
    const pid = lsof?.split('\n')[0]?.trim()
    const rss = pid && /^\d+$/.test(pid) ? await attempt(() => exec('/bin/ps', ['-o', 'rss=', '-p', pid])) : null
    const load = { cpuIdlePct: num(idle), load1: num(loads[0]), load5: num(loads[1]), load15: num(loads[2]) }
    const memory = { freePct: num(free) }
    const opencodeServer = { port: OPENCODE_PORT, rssMb: rss && num(rss.trim()) !== null ? Math.round(Number(rss.trim()) / 1024) : null }
    const anyOk = Object.values(load).some(v => v !== null) || memory.freePct !== null || procs.length > 0 || opencodeServer.rssMb !== null
    return { load, memory, topProcesses: procs, opencodeServer, anyOk }
  }
  const get = createSingleFlight(read, { ttlMs: 5000, timeoutMs: 15000 })
  return {
    async get(): Promise<LiveReadings> {
      const r = await get()
      if (r.status === 'ok') return r.value
      return { anyOk: false, load: { cpuIdlePct: null, load1: null, load5: null, load15: null }, memory: { freePct: null }, topProcesses: [], opencodeServer: { port: OPENCODE_PORT, rssMb: null } }
    },
  }
}
