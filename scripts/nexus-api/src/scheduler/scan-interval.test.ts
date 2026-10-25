import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseScanInterval as cliParse, readScanIntervalFile as cliRead } from '../../../../packages/cli/src/autonomous/guardrails.ts'
import { DEFAULT_SCAN_MINUTES, parseScanMinutes, readScanInterval } from './scan-interval.ts'

const block = (v: string): string => `profile: x\nnightwatch:\n  scan_every_minutes: ${v}\n  budgets:\n    review: 60\nother: 1\n`

describe('parseScanMinutes', () => {
  it('the default is 30', () => { expect(DEFAULT_SCAN_MINUTES).toBe(30) })
  it.each([['30', 30], ['5', 5], ['720', 720], ['15   # quarter hour', 15]])('good value %s', (v, n) => {
    expect(parseScanMinutes(block(v))).toEqual({ minutes: n, problem: null })
  })
  it('missing key or block: 30, no problem', () => {
    expect(parseScanMinutes('profile: x\n')).toEqual({ minutes: 30, problem: null })
    expect(parseScanMinutes('nightwatch:\n  budgets:\n    review: 60\n')).toEqual({ minutes: 30, problem: null })
  })
  it.each(['4', '721', 'x', '7.5', '0', '-5', '030x', '', '"30"', '[5]'])('bad value %j: 30 and a problem', (v) => {
    const r = parseScanMinutes(block(v))
    expect(r.minutes).toBe(30)
    expect(r.problem).toMatch(/scan_every_minutes/)
  })
  it('a duplicate key and an indented child are problems', () => {
    expect(parseScanMinutes('nightwatch:\n  scan_every_minutes: 10\n  scan_every_minutes: 20\n')).toMatchObject({ minutes: 30, problem: expect.any(String) })
    expect(parseScanMinutes('nightwatch:\n  scan_every_minutes: 10\n    foo: bar\n')).toMatchObject({ minutes: 30, problem: expect.any(String) })
  })
  it('same answer as the CLI parser on every case', () => {
    const cases = [block('30'), block('5'), block('720'), block('4'), block('721'), block('x'), block('7.5'), block(''), block('"30"'), block('[5]'), block('12 # c'),
      'profile: x\n', 'nightwatch:\n  budgets:\n    review: 60\n', 'nightwatch:\n  scan_every_minutes: 10\n  scan_every_minutes: 20\n',
      'nightwatch:\n  scan_every_minutes: 10\n    foo: bar\n', 'nightwatch: {}\n', 'nightwatch:\n\tscan_every_minutes: 10\n',
      'nightwatch:\n    scan_every_minutes: 45\n    protected_paths:\n      - hooks/\n', 'other:\n  scan_every_minutes: 10\n', '﻿nightwatch:\n  scan_every_minutes: 20\n']
    for (const text of cases) {
      const api = parseScanMinutes(text)
      const cli = cliParse(text)
      expect({ text, minutes: api.minutes, problem: api.problem }).toEqual({ text, minutes: cli.minutes, problem: cli.problems[0] ?? null })
    }
  })
})

describe('readScanInterval', () => {
  it('reads the file each call', () => {
    const f = join(mkdtempSync(join(tmpdir(), 'scan-')), 'config.yml')
    writeFileSync(f, block('15'))
    expect(readScanInterval(f)).toEqual({ minutes: 15, problem: null })
    writeFileSync(f, block('20'))
    expect(readScanInterval(f)).toEqual({ minutes: 20, problem: null })
  })
  it('a missing file is a missing key: 30, no problem, like the CLI', () => {
    const repo = mkdtempSync(join(tmpdir(), 'scan-'))
    expect(readScanInterval(join(repo, '.digismith', 'config.yml'))).toEqual({ minutes: 30, problem: null })
    expect(cliRead(repo)).toEqual({ minutes: 30, problems: [] })
  })
  it('a file that cannot be read is a problem, and both readers say so', () => {
    const repo = mkdtempSync(join(tmpdir(), 'scan-'))
    mkdirSync(join(repo, '.digismith', 'config.yml'), { recursive: true }) // a directory where the file should be: EISDIR
    const api = readScanInterval(join(repo, '.digismith', 'config.yml'))
    const cli = cliRead(repo)
    expect(api.minutes).toBe(30)
    expect(api.problem).toMatch(/cannot read/)
    expect(cli.minutes).toBe(30)
    expect(cli.problems[0]).toMatch(/cannot be read/)
  })
  it('a duplicate key after a bad first value gives the same reason in both readers', () => {
    const t = 'nightwatch:\n  scan_every_minutes: 4\n  scan_every_minutes: 5\n'
    expect(parseScanMinutes(t).problem).toMatch(/more than once/)
    expect(cliParse(t).problems).toEqual([parseScanMinutes(t).problem])
  })
})
