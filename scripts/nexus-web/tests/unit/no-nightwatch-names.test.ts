// DGS-599: the dashboard surface says Oculus. Engine names (run/event schemas, the nightwatch-watchdog job) may stay.
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const WEB = join(__dirname, '../..')
const ALLOWED = /nightwatch-watchdog|nightwatch-(run|event|attention|journal)\/v1|no-nightwatch-names/
function hits(pattern: string): string[] {
  let out = ''
  try { out = execFileSync('git', ['grep', '-n', '-I', '-E', pattern, '--', 'app', 'tests', 'nuxt.config.ts', '.storybook', ':!tests/visual/__screenshots__', ':!tests/unit/no-nightwatch-names.test.ts'], { cwd: WEB, encoding: 'utf8' }) } catch (e) {
    // git grep exits 1 when nothing matches; any other failure (bad pattern, no repo) must not pass as 'no hits'
    if ((e as { status?: number }).status === 1) return []
    throw e
  }
  return out.split('\n').filter(Boolean)
}
describe('no Nightwatch names on the dashboard surface', () => {
  it('the guard throws on a broken pattern instead of passing', () => {
    expect(() => hits('(unbalanced')).toThrow()
  })
  it('no Nw* component, nw- class or --nw- token is left', () => {
    expect(hits('(^|[^A-Za-z0-9_])Nw[A-Z]|--nw-|(^|[^A-Za-z0-9_/-])nw($|[^A-Za-z0-9_])|(^|[^A-Za-z0-9_])nw-[a-z]|nwOverview|nw-format|/nw/|NW_')).toEqual([])
  })
  it('nothing else says nightwatch', () => {
    expect(hits('[Nn]ightwatch').filter((l) => !ALLOWED.test(l))).toEqual([])
  })
})
