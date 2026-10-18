import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { UTC7_OFFSET_MS } from './clock.ts'
import type { RunRecord } from './types.ts'

export interface State {
  cleanStop: boolean
  inFlight: { job: string; startedAt: string; pid: number } | null
  lastSlot: Record<string, string>
}

const DETAIL_MAX = 2000
const RUNS_FILE = /^runs-\d{4}-\d{2}\.jsonl$/

export function stateDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.NEXUS_STATE_DIR || path.join(os.homedir(), '.digismith-depot', 'nexus', 'scheduler')
}

const defaultState = (): State => ({ cleanStop: false, inFlight: null, lastSlot: {} })

function monthFile(startedAt: string): string {
  const d = new Date(Date.parse(startedAt) + UTC7_OFFSET_MS)
  return `runs-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}.jsonl`
}

export async function appendRun(dir: string, record: RunRecord): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
  const detail = record.detail.length > DETAIL_MAX ? record.detail.slice(-DETAIL_MAX) : record.detail
  await fs.appendFile(path.join(dir, monthFile(record.startedAt)), JSON.stringify({ ...record, detail }) + '\n')
}

export async function readRuns(dir: string, opts: { job?: string; limit: number }): Promise<RunRecord[]> {
  let files: string[]
  try {
    files = (await fs.readdir(dir)).filter((f) => RUNS_FILE.test(f)).sort().reverse()
  } catch {
    return []
  }
  const out: RunRecord[] = []
  for (const f of files) {
    if (out.length >= opts.limit) break
    let text: string
    try {
      text = await fs.readFile(path.join(dir, f), 'utf8')
    } catch {
      continue
    }
    const lines = text.split('\n')
    for (let i = lines.length - 1; i >= 0 && out.length < opts.limit; i--) {
      if (!lines[i].trim()) continue
      try {
        const r = JSON.parse(lines[i]) as RunRecord
        if (r && typeof r === 'object' && (!opts.job || r.job === opts.job)) out.push(r)
      } catch {
        continue
      }
    }
  }
  return out
}

export async function readState(dir: string): Promise<State> {
  try {
    const s = JSON.parse(await fs.readFile(path.join(dir, 'state.json'), 'utf8'))
    if (!s || typeof s !== 'object' || Array.isArray(s)) return defaultState()
    return {
      cleanStop: s.cleanStop === true,
      inFlight: s.inFlight && typeof s.inFlight === 'object' ? s.inFlight : null,
      lastSlot: s.lastSlot && typeof s.lastSlot === 'object' && !Array.isArray(s.lastSlot) ? s.lastSlot : {},
    }
  } catch {
    return defaultState()
  }
}

export async function writeState(dir: string, state: State): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
  const tmp = path.join(dir, 'state.tmp')
  await fs.writeFile(tmp, JSON.stringify(state))
  await fs.rename(tmp, path.join(dir, 'state.json'))
}
