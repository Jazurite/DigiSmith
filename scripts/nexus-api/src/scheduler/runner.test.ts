import { describe, it, expect } from 'vitest'
import { runJob } from './runner.ts'

const node = (code: string, ...rest: string[]) => ({ file: process.execPath, args: ['-e', code, ...rest] })
const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }

describe('runJob', () => {
  it('resolves ok with exit 0 and the output', async () => {
    const r = await runJob(node('process.stdout.write("hello")'), { timeoutMs: 10_000 })
    expect(r.status).toBe('ok')
    expect(r.exitCode).toBe(0)
    expect(r.detail).toBe('hello')
    expect(typeof r.pid).toBe('number')
  })

  it('resolves failed with exit 1 and keeps only the last 2000 characters', async () => {
    const code = 'process.stdout.write("A".repeat(5000)); process.stderr.write("END"); process.exit(1)'
    const r = await runJob(node(code), { timeoutMs: 10_000 })
    expect(r.status).toBe('failed')
    expect(r.exitCode).toBe(1)
    expect(r.detail.length).toBe(2000)
    expect(r.detail.endsWith('END')).toBe(true)
  })

  it('stays bounded with a chatty job', async () => {
    const code = 'for (let i = 0; i < 2000; i++) process.stdout.write("x".repeat(1000)); process.stdout.write("LAST")'
    const r = await runJob(node(code), { timeoutMs: 20_000 })
    expect(r.status).toBe('ok')
    expect(r.detail.length).toBe(2000)
    expect(r.detail.endsWith('LAST')).toBe(true)
  })

  it('kills a sleeping child on timeout', async () => {
    const pids: number[] = []
    const r = await runJob(node('setInterval(() => {}, 1000)'), { timeoutMs: 300, killGraceMs: 200, onStart: (p) => pids.push(p) })
    expect(r.status).toBe('timeout')
    expect(alive(pids[0])).toBe(false)
  })

  it('escalates to SIGKILL for a child that ignores SIGTERM', async () => {
    const pids: number[] = []
    const t0 = Date.now()
    const r = await runJob(node('process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)'), { timeoutMs: 600, killGraceMs: 300, onStart: (p) => pids.push(p) })
    expect(r.status).toBe('timeout')
    expect(Date.now() - t0).toBeGreaterThanOrEqual(850)
    expect(alive(pids[0])).toBe(false)
  })

  it('resolves failed with exitCode null for a command that does not exist', async () => {
    const r = await runJob({ file: '/nonexistent/definitely-not-here', args: [] }, { timeoutMs: 5_000 })
    expect(r.status).toBe('failed')
    expect(r.exitCode).toBeNull()
    expect(r.detail).toMatch(/ENOENT/)
  })

  it('passes an argument with a semicolon as one argument', async () => {
    const r = await runJob(node('process.stdout.write(JSON.stringify(process.argv.slice(1)))', 'a;echo pwned'), { timeoutMs: 10_000 })
    expect(r.status).toBe('ok')
    expect(JSON.parse(r.detail)).toEqual(['a;echo pwned'])
  })

  it('stops a running child on abort and resolves interrupted', async () => {
    const ac = new AbortController()
    const pids: number[] = []
    const p = runJob(node('process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)'), {
      timeoutMs: 30_000, killGraceMs: 300, signal: ac.signal,
      onStart: (pid) => { pids.push(pid); setTimeout(() => ac.abort(), 400) },
    })
    const r = await p
    expect(r.status).toBe('interrupted')
    expect(alive(pids[0])).toBe(false)
  })

  it('resolves interrupted without starting when the signal is already aborted', async () => {
    const ac = new AbortController()
    ac.abort()
    const r = await runJob(node('process.stdout.write("x")'), { timeoutMs: 5_000, signal: ac.signal })
    expect(r.status).toBe('interrupted')
    expect(r.pid).toBeUndefined()
  })

  it('calls onStart with the child pid', async () => {
    const seen: number[] = []
    const r = await runJob(node('0'), { timeoutMs: 10_000, onStart: (p) => seen.push(p) })
    expect(seen).toHaveLength(1)
    expect(seen[0]).toBe(r.pid)
  })
})
