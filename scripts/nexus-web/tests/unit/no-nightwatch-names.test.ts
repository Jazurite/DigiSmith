// DGS-599: the dashboard surface says Oculus. Engine names (run/event schemas, the nightwatch-watchdog job) may stay.
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const WEB = join(__dirname, '../..')
const ALLOWED = /nightwatch-watchdog|nightwatch-(run|event|attention|journal)\/v1|no-nightwatch-names|\\?\/nightwatch\\?\/|'nightwatch\/|pages\/nightwatch|· Nightwatch|"Nightwatch"|name: 'Nightwatch'|>nightwatch</
function hits(pattern: string): string[] {
  let out = ''
  try { out = execFileSync('git', ['grep', '-n', '-I', '-E', pattern, '--', 'app', 'tests', 'nuxt.config.ts', '.storybook', ':!tests/visual/__screenshots__', ':!tests/unit/no-nightwatch-names.test.ts'], { cwd: WEB, encoding: 'utf8' }) } catch { return [] }
  return out.split('\n').filter(Boolean)
}
describe('no Nightwatch names on the dashboard surface', () => {
  it('no Nw* component, nw- class or --nw- token is left', () => {
    expect(hits('(^|[^A-Za-z0-9_])Nw[A-Z]|--nw-|(^|[^A-Za-z0-9_/-])nw($|[^A-Za-z0-9_])|(^|[^A-Za-z0-9_])nw-[a-z]|nwOverview|nw-format|/nw/|NW_')).toEqual([])
  })
  it('only page paths and titles still say nightwatch (Task 4 moves them)', () => {
    expect(hits('[Nn]ightwatch').filter((l) => !ALLOWED.test(l))).toEqual([])
  })
})
