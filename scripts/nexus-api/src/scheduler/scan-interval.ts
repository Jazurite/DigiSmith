import { readFileSync } from 'node:fs'

// The installed API is a self-contained copy and cannot import packages/cli. This is the same rule as
// parseScanInterval in packages/cli/src/autonomous/guardrails.ts; scan-interval.test.ts runs both on the same cases.
export const DEFAULT_SCAN_MINUTES = 30
const MIN = 5
const MAX = 720 // validateJobs: everyMinutes

export interface ScanInterval { minutes: number; problem: string | null }

const SIGNIFICANT = /^\s*[^#\s]/
const indentOf = (l: string): number => l.length - l.trimStart().length
const stripComment = (v: string): string => v.replace(/\s+#.*$/, '').trim()

/** Reads nightwatch.scan_every_minutes from the text of config.yml. Missing key: 30, no problem. Anything bad: 30 and a problem. */
export function parseScanMinutes(text: string): ScanInterval {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  const start = lines.findIndex((l) => /^nightwatch:\s*(#.*)?$/.test(l))
  if (start < 0) return { minutes: DEFAULT_SCAN_MINUTES, problem: null }
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) if (SIGNIFICANT.test(lines[i]!) && indentOf(lines[i]!) === 0) { end = i; break }
  const body = lines.slice(start + 1, end)
  // a tab makes the whole block a guardrail problem for the CLI; the setting is not read then
  if (body.some((l) => /^[ \t]*\t/.test(l))) return { minutes: DEFAULT_SCAN_MINUTES, problem: null }
  const sig = body.filter((l) => SIGNIFICANT.test(l))
  if (sig.length === 0) return { minutes: DEFAULT_SCAN_MINUTES, problem: null }
  const childIndent = indentOf(sig[0]!)
  const fallback = (why: string): ScanInterval => ({ minutes: DEFAULT_SCAN_MINUTES, problem: `nightwatch.scan_every_minutes: ${why}; ${DEFAULT_SCAN_MINUTES} used` })
  let found: ScanInterval | null = null
  let seen = 0
  for (let k = 0; k < sig.length; k++) {
    const l = sig[k]!
    if (indentOf(l) !== childIndent) continue
    const m = /^\s+([a-z0-9_]+):(.*)$/.exec(l)
    if (!m || m[1] !== 'scan_every_minutes') continue
    seen++
    if (seen > 1) return fallback('is set more than once')
    const inline = stripComment(m[2]!)
    let kids = 0
    for (let j = k + 1; j < sig.length && indentOf(sig[j]!) > childIndent; j++) kids++
    if (kids > 0) found = fallback('has indented lines under it')
    else if (!/^[1-9]\d*$/.test(inline) || Number(inline) < MIN || Number(inline) > MAX) found = fallback(`"${inline}" is not a whole number from ${MIN} to ${MAX}`)
    else found = { minutes: Number(inline), problem: null }
  }
  return found ?? { minutes: DEFAULT_SCAN_MINUTES, problem: null }
}

/** One small read per call. A read error is a fallback with a problem, never a throw. */
export function readScanInterval(file: string): ScanInterval {
  let text: string
  try { text = readFileSync(file, 'utf-8') } catch {
    return { minutes: DEFAULT_SCAN_MINUTES, problem: `nightwatch.scan_every_minutes: cannot read ${file}; ${DEFAULT_SCAN_MINUTES} used` }
  }
  return parseScanMinutes(text)
}
