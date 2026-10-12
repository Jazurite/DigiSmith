import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

// DGS-224: the claude-account tests are bash. /bin/bash is 3.2 on macOS, the oldest bash the tool must run on.
it('claude-account passes its bash tests under /bin/bash', () => {
  const file = fileURLToPath(new URL('./test-claude-account.sh', import.meta.url))
  const r = spawnSync('/bin/bash', [file], { encoding: 'utf8' })
  expect(r.stdout + r.stderr).not.toMatch(/FAIL:/)
  expect(r.status).toBe(0)
}, 120_000)
