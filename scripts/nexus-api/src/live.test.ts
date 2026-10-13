import { describe, expect, it, vi } from 'vitest'
import { createLive, type LiveExec } from './live.ts'

const OUT: Record<string, string> = {
  '/usr/bin/top': 'Processes: 1\nCPU usage: 9.0% user, 9.0% sys, 82.0% idle\n\nProcesses: 2\nCPU usage: 4.30% user, 3.10% sys, 92.60% idle\n',
  '/usr/sbin/sysctl': '{ 2.87 3.43 3.50 }\n',
  '/usr/bin/memory_pressure': 'The system has 17179869184 (4194304 pages)\nSystem-wide memory free percentage: 77%\n',
  '/bin/ps': '  RSS  %CPU COMM\n 831488   3.1 /usr/local/bin/node\n 512000   0.5 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome\n  1024   0.0 /bin/zsh\n',
  '/usr/sbin/lsof': '4242\n',
}
const fake = (over: Partial<Record<string, string | Error>> = {}): LiveExec => vi.fn(async (file: string, args: string[]) => {
  const key = file === '/bin/ps' && args.includes('-p') ? '/bin/ps#pid' : file
  const v = key in over ? over[key] : key === '/bin/ps#pid' ? '1373184\n' : OUT[file]
  if (v instanceof Error) throw v
  return v as string
})

describe('live readers', () => {
  it('parses load, memory, top processes and the OpenCode server', async () => {
    const r = await createLive(fake()).get()
    expect(r.load).toEqual({ cpuIdlePct: 92.6, load1: 2.87, load5: 3.43, load15: 3.5 })
    expect(r.memory).toEqual({ freePct: 77 })
    expect(r.topProcesses[0]).toEqual({ name: 'node', rssMb: 812, cpuPct: 3.1 })
    expect(r.topProcesses[1].name).toBe('Google Chrome')
    expect(r.opencodeServer).toEqual({ port: 4198, rssMb: 1341 })
    expect(r.anyOk).toBe(true)
  })
  it('one failing reader gives null for its fields only', async () => {
    const r = await createLive(fake({ '/usr/bin/memory_pressure': new Error('x') })).get()
    expect(r.memory.freePct).toBeNull()
    expect(r.load.load1).toBe(2.87)
  })
  it('nothing listening on 4198 gives rssMb null', async () => {
    const r = await createLive(fake({ '/usr/sbin/lsof': '' })).get()
    expect(r.opencodeServer).toEqual({ port: 4198, rssMb: null })
  })
  it('every reader failing gives anyOk false', async () => {
    const exec: LiveExec = async () => { throw new Error('x') }
    const r = await createLive(exec).get()
    expect(r.anyOk).toBe(false)
    expect(r.topProcesses).toEqual([])
  })
  it('uses fixed absolute paths and never a shell', async () => {
    const exec = fake()
    await createLive(exec).get()
    for (const [file] of (exec as ReturnType<typeof vi.fn>).mock.calls) expect(file).toMatch(/^\/(usr\/)?s?bin\/|^\/usr\/(s)?bin\//)
  })
  it('caches for 5 s (one set of reads for two calls)', async () => {
    const exec = fake()
    const live = createLive(exec)
    await live.get(); const n = (exec as ReturnType<typeof vi.fn>).mock.calls.length
    await live.get()
    expect((exec as ReturnType<typeof vi.fn>).mock.calls.length).toBe(n)
  })
  it('real commands give numbers in range (smoke, no sudo)', async () => {
    const r = await createLive().get()
    expect(r.load.load1).toBeGreaterThanOrEqual(0)
    expect(r.memory.freePct).toBeGreaterThan(0)
    expect(r.topProcesses.length).toBeGreaterThan(0)
  }, 20000)
})
