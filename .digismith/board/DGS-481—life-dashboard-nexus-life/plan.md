# Life Dashboard on Nexus (DGS-481) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jack's private life dashboard at `https://pazurite.com/`: the Life Calendar widget (a life in weeks), served as static files by Caddy, fed by an encrypted-at-rest profile through a Hono API on the Nexus server.

**Architecture:** The Nexus API (Node, TypeScript) moves onto Hono, keeps `/api/v1/power-metrics` byte-for-byte, and gains `GET /api/v1/life-calendar`. The profile (birth date, life length) is one AES-256-GCM blob in an embedded PostgreSQL (PGlite) folder; the key is a mode-600 file for the first deploy. One shared Zod schema (`scripts/nexus-shared/`) types and validates the JSON on both sides. The page is a Nuxt 4 app (Vue 3, SCSS) generated to static files; it calls the API with Hono's typed client. Storybook (served at `/storybook/`), Playwright (end to end, visual regression, axe) and Lighthouse CI guard it.

**Tech Stack:** TypeScript on Node 24, Hono 4.13.13, @hono/node-server 2.1.5, @hono/zod-validator 0.9.1, Zod 4.6.7, @electric-sql/pglite 0.5.10, Nuxt 4.6.1, Vue 3.5.44, sass 1.105.2, vue-tsc 3.3.13, Storybook 10.6.2 with @nuxtjs/storybook 10.0.1 and @storybook/addon-a11y 10.6.2, Vitest (root 2.1.x, page package 5.0.5), @nuxt/test-utils 4.3.3, @vue/test-utils 2.5.1, happy-dom 21.0.3, @playwright/test 1.64.1, @axe-core/playwright 4.14.0, axe-core 4.14.0, @lhci/cli 0.15.1, web-vitals 6.2.3, pnpm.

Spec: `.digismith/board/DGS-481—life-dashboard-nexus-life/design.html`. Visual reference: `ui-design.md` and `mock.html` in the same folder (fake data only).

## Global Constraints

Copied from the spec. Every task includes these.

- **Privacy (hard rule):** Jack's birth date and life length never appear in the repo, ClickUp, a spec, a plan, a test, a log or a pane. Tests and stories use the fake profile: born `1990-01-01`, life 90 years, fixed "today" `2026-10-16`. Nobody opens `~/.digismith-depot/nexus/profile.private.json`; only the seed step (task 6) reads it, when the deploy runs it.
- The API returns only the computed calendar. No field is named for a birth date; the shared schema is strict. The tooltip date ranges reveal the birth date to anyone who can see the page or the JSON (today only Jack's devices on the tailnet). Jack accepted this (decision A).
- Counting: date-only, UTC+7 "today"; row k starts on the k-th birthday; box j covers days 7j to 7j+6; box 51 absorbs the extra day or two; 29 February birthday counts as 1 March in non-leap years; the current box is neither lived nor ahead.
- `GET /api/v1/power-metrics` stays byte-for-byte the same (JSON key order, 200 and 503 codes, 404 and 405 bodies, headers). The server binds `127.0.0.1:4300` only and the LaunchAgent wrapper (`nexus-api.sh.tmpl`) is unchanged.
- Backend: Hono on `@hono/node-server`. Database: PGlite, data folder `~/.digismith-depot/nexus/db/`, mode 700. Encryption: AES-256-GCM, 12-byte random nonce per seed, associated data `nexus-profile:v1`. Key for the first deploy: 32 bytes in `~/.digismith-depot/nexus/profile.key`, mode 600, created by the seed step if missing, never overwritten. `NEXUS_KEY_PROVIDER=file|keychain` chooses; `keychain` fails closed until its own task.
- Errors: 503 `profile_missing`, `profile_invalid`, `key_unavailable`, `internal_invalid`; 400 `bad_request`; 404 `not_found`; 405 `method_not_allowed` with `Allow: GET`. No message text is built from data.
- Logging: one JSON line per request from `logger.ts` only: time, level, method, path without query, status, ms, error code. No `console.` call outside `logger.ts` and `print-sudoers.ts`.
- Seed step prints nothing on success, only a field or step name on failure, never a value or a key, never changes or deletes the input file.
- Page: Nuxt 4, `nuxt generate` (static), no Nitro server, no router, no new LaunchAgent, no CDN. The build never reads the API or the profile. Plain SCSS, tokens on `:root`, dark mode follows the device (`prefers-color-scheme`). The Designer's recommendations apply, **pending Jack**: vermilion accent `#e8401c` (dark `#ff5a3c`), row labels every 10 years with a gap after each decade, stat labels "weeks lived", "weeks left", "lived".
- Accessibility: WCAG 2.2 AA in light and dark; grid with `role="grid"`; axe violations fail the run, no allow-list.
- Performance budgets (desktop and 4x-slowed phone): LCP under 2.5 s, INP under 200 ms, CLS under 0.1.
- Node `--experimental-strip-types` runs the API and the seed step: no enums, no parameter properties, no namespaces, imports end in `.ts`, type-only imports use `import type`.
- Versions are pinned exactly (no `^`). Nothing is installed or restarted in the planning phase; the build order may install packages and download Playwright's Chromium.
- No Co-Authored-By or AI footer in commits. Commits are title-only, conventional (`feat(dgs-481): ...`). Commit with a pathspec.
- Deletes need Jack. Never read or print tokens, keys or `.env` values. ClickUp writes only through `dg`.

---

## File Structure

```
pnpm-workspace.yaml                      modify: add scripts/nexus-api, scripts/nexus-shared, scripts/nexus-web
vitest.config.ts                         modify: exclude scripts/nexus-web/**
scripts/nexus-shared/                    NEW, a pnpm package, copied to $DEPOT/nexus-shared
  package.json                           zod only
  days.ts                                parseDay, formatDay, addDays, formatShort, formatLong, boxRange
  life-calendar.ts                       lifeCalendarSchema, apiErrorSchema, types
scripts/nexus-api/
  package.json                           NEW: the five runtime dependencies, exact versions
  install.sh                             modify: package.json, pnpm install --prod, nexus-shared, symlink
  seed-profile.ts                        NEW: the seed step (CLI + seed())
  src/app.ts                             NEW: buildApp(), sendJson(), AppType
  src/server.ts                          modify: createApiServer() via createAdaptorServer; entry uses logger
  src/logger.ts                          NEW
  src/life-calendar.ts                   NEW: computeCalendar(), todayUtc7(), readAtUtc7()
  src/life-calendar-route.ts             NEW: the route (a function that adds the route to a Hono chain)
  src/profile-crypto.ts                  NEW: seal(), open(), CryptoError
  src/key-provider.ts                    NEW: KeyProvider, fileKeyProvider(), selectKeyProvider(), KeyError
  src/profile-store.ts                   NEW: openStore() on PGlite
  src/*.test.ts                          NEW tests beside each module
scripts/nexus-web/                       NEW Nuxt 4 app (tasks 9 to 12), Storybook (14), tests (15 to 18)
scripts/caddy/Caddyfile, caddy-run.sh, test-config.mjs   modify (task 8)
```

---

### Task 1: Move the Nexus API onto Hono

**Files:**
- Create: `scripts/nexus-api/package.json`, `scripts/nexus-api/src/app.ts`, `scripts/nexus-api/src/app.test.ts`, `scripts/nexus-api/src/fixtures/make-old-response.ts`, `scripts/nexus-api/src/fixtures/power-metrics-old-response.json`
- Modify: `pnpm-workspace.yaml`, `scripts/nexus-api/src/server.ts`, `scripts/nexus-api/install.sh`, `scripts/nexus-api/test-install.test.ts`

**Interfaces:**
- Produces: `buildApp(getReading: () => Promise<PowerMetrics | null>): Hono<Env>`; `sendJson(c, status, body, headers?)`; `export type AppType = ReturnType<typeof buildApp>`; `createApiServer(getReading): http.Server` (not listening, same as today); `POWER_PATH`.
- Consumes: `types.ts` (`ApiError`, `PowerMetrics`), `version.ts` (`API_VERSION`).

- [ ] **Step 1: Pin the dependencies and add the workspace entries**

Create `scripts/nexus-api/package.json`:

```json
{
  "name": "@digismith/nexus-api",
  "private": true,
  "type": "module",
  "dependencies": {
    "@electric-sql/pglite": "0.5.10",
    "@hono/node-server": "2.1.5",
    "@hono/zod-validator": "0.9.1",
    "hono": "4.13.13",
    "zod": "4.6.7"
  }
}
```

In `pnpm-workspace.yaml`, change `packages:` to:

```yaml
packages:
  - "packages/*"
  - "scripts/nexus-api"
```

(`scripts/nexus-shared` is added in task 3 and `scripts/nexus-web` in task 9, when those folders exist.)

Run: `pnpm install` from the worktree root. Expected: installs the five packages, writes `pnpm-lock.yaml`. Then confirm the export used below exists:

Run: `node -e "import('@hono/node-server').then(m => console.log(typeof m.createAdaptorServer))"` from `scripts/nexus-api`. Expected: `function`. If it prints `undefined`, use `serve({ fetch, port: 0, hostname: '127.0.0.1' })` for tests instead and tell the Maestro; keep the rest.

- [ ] **Step 2: Capture the old server's bytes before any change**

Create `scripts/nexus-api/src/fixtures/make-old-response.ts`:

```ts
// Run ONCE against the pre-Hono server.ts to store its exact response bytes. Never run after step 5.
import { readFileSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { parsePowermetrics } from '../parse-powermetrics.ts'
import { buildReading } from '../reading.ts'
import { createApiServer, HOST } from '../server.ts'

const NOW = 1_792_000_000_000
const parsed = parsePowermetrics(readFileSync(new URL('./powermetrics-real-sample.txt', import.meta.url), 'utf8'))
const live = { anyOk: true, load: { cpuIdlePct: 85, load1: 3, load5: 3, load15: 3 }, memory: { freePct: 74 }, topProcesses: [], opencodeServer: { port: 4198, rssMb: null } }
const server = createApiServer(async () => buildReading(NOW, { status: 'ok', value: parsed, at: NOW - 2000 }, live))
await new Promise<void>(r => server.listen(0, HOST, r))
const port = (server.address() as AddressInfo).port
const text = await (await fetch(`http://127.0.0.1:${port}/api/v1/power-metrics`)).text()
writeFileSync(new URL('./power-metrics-old-response.json', import.meta.url), text)
server.close()
console.log('stored', text.length, 'bytes')
```

Run: `node --experimental-strip-types scripts/nexus-api/src/fixtures/make-old-response.ts`
Expected: `stored <n> bytes` and the new file exists. Commit it now so the old bytes are in git history before the rewrite:

```bash
git add -- scripts/nexus-api/package.json pnpm-workspace.yaml pnpm-lock.yaml scripts/nexus-api/src/fixtures/make-old-response.ts scripts/nexus-api/src/fixtures/power-metrics-old-response.json
git commit -m "chore(dgs-481): pin the API dependencies and store the old power response" -- scripts/nexus-api/package.json pnpm-workspace.yaml pnpm-lock.yaml scripts/nexus-api/src/fixtures/make-old-response.ts scripts/nexus-api/src/fixtures/power-metrics-old-response.json
```

- [ ] **Step 3: Write the failing test**

Create `scripts/nexus-api/src/app.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { parsePowermetrics } from './parse-powermetrics.ts'
import { buildReading } from './reading.ts'
import { createApiServer, HOST } from './server.ts'
import type { PowerMetrics } from './types.ts'

const NOW = 1_792_000_000_000
const parsed = parsePowermetrics(readFileSync(new URL('./fixtures/powermetrics-real-sample.txt', import.meta.url), 'utf8'))
const live = { anyOk: true, load: { cpuIdlePct: 85, load1: 3, load5: 3, load15: 3 }, memory: { freePct: 74 }, topProcesses: [], opencodeServer: { port: 4198, rssMb: null } }
const reading = buildReading(NOW, { status: 'ok', value: parsed, at: NOW - 2000 }, live) as PowerMetrics

let server: ReturnType<typeof createApiServer> | undefined
afterEach(async () => { if (server) await new Promise(r => server!.close(r)); server = undefined })
async function start(get: () => Promise<PowerMetrics | null>) {
  server = createApiServer(get)
  await new Promise<void>(r => server!.listen(0, HOST, r))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}
const PATH = '/api/v1/power-metrics'

describe('the Hono app keeps the old power-metrics behaviour', () => {
  it('sends exactly the bytes the old server sent', async () => {
    const base = await start(async () => reading)
    const text = await (await fetch(base + PATH)).text()
    expect(text).toBe(readFileSync(new URL('./fixtures/power-metrics-old-response.json', import.meta.url), 'utf8'))
  })
  it('keeps the old headers on 200', async () => {
    const base = await start(async () => reading)
    const r = await fetch(base + PATH)
    expect(r.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(r.headers.get('cache-control')).toBe('no-store')
  })
  it('HEAD still gets 405 with Allow: GET', async () => {
    const base = await start(async () => reading)
    const r = await fetch(base + PATH, { method: 'HEAD' })
    expect(r.status).toBe(405)
    expect(r.headers.get('allow')).toBe('GET')
  })
  it('POST gets 405 with the old body', async () => {
    const base = await start(async () => reading)
    const r = await fetch(base + PATH, { method: 'POST' })
    expect(r.status).toBe(405)
    expect(await r.json()).toEqual({ error: 'method_not_allowed' })
  })
  it('a trailing slash and a different letter case are still 404 with the old body', async () => {
    const base = await start(async () => reading)
    for (const p of [PATH + '/', '/API/v1/power-metrics']) {
      const r = await fetch(base + p)
      expect(r.status).toBe(404)
      expect(await r.json()).toEqual({ error: 'not_found' })
      expect(r.headers.get('cache-control')).toBe('no-store')
    }
  })
  it('503 no_reading keeps Retry-After and the old body', async () => {
    const base = await start(async () => null)
    const r = await fetch(base + PATH)
    expect(r.status).toBe(503)
    expect(r.headers.get('retry-after')).toBe('5')
    expect(await r.json()).toEqual({ error: 'no_reading', message: 'no reading could be built' })
  })
  it('a malformed escape in the path does not crash the server', async () => {
    const base = await start(async () => reading)
    const r = await fetch(base + '/%E0%A4%A')
    expect([400, 404]).toContain(r.status)
    expect((await fetch(base + PATH)).status).toBe(200)
  })
})
```

- [ ] **Step 4: Run the test to see it fail**

Run: `pnpm vitest run scripts/nexus-api/src/app.test.ts` from the worktree root.
Expected: FAIL (the old server has no `app.ts`, and the HEAD test may already pass or fail; the byte test passes on the old server, which is the point: it must still pass after the rewrite). If everything passes on the old server, that is correct: this task is a refactor, and these tests are the guard. Continue.

- [ ] **Step 5: Write `app.ts` and rewrite `server.ts`**

Create `scripts/nexus-api/src/app.ts`:

```ts
import { Hono } from 'hono'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { ApiError, PowerMetrics } from './types.ts'
import { API_VERSION } from './version.ts'

export const POWER_PATH = `/api/${API_VERSION}/power-metrics` as const

// c.json() would drop the charset and re-order nothing, but c.body(JSON.stringify(...)) keeps the old bytes and headers exactly.
export function sendJson(c: Context, status: ContentfulStatusCode, body: unknown, headers: Record<string, string> = {}) {
  return c.body(JSON.stringify(body), status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers })
}

export function buildApp(getReading: () => Promise<PowerMetrics | null>) {
  const app = new Hono()
  app.all(POWER_PATH, async c => {
    // Hono runs a HEAD request through the GET route; c.req.method still says HEAD, so HEAD gets the old 405.
    if (c.req.method !== 'GET') return sendJson(c, 405, { error: 'method_not_allowed' }, { Allow: 'GET' })
    let reading: PowerMetrics | null = null
    try { reading = await getReading() } catch { reading = null }
    if (!reading) {
      const err: ApiError = { error: 'no_reading', message: 'no reading could be built' }
      return sendJson(c, 503, err, { 'Retry-After': '5' })
    }
    return sendJson(c, 200, reading)
  })
  app.notFound(c => sendJson(c, 404, { error: 'not_found' }))
  app.onError((_err, c) => sendJson(c, 503, { error: 'internal_invalid' }))   // never prints the error: its message could hold data
  return app
}
export type AppType = ReturnType<typeof buildApp>
```

Replace `scripts/nexus-api/src/server.ts` with:

```ts
import { createAdaptorServer } from '@hono/node-server'
import type { Server } from 'node:http'
import { pathToFileURL } from 'node:url'
import { buildApp, POWER_PATH } from './app.ts'
import { createLive } from './live.ts'
import { createPowermetricsSource, type RunPowermetrics } from './powermetrics-source.ts'
import { buildReading } from './reading.ts'
import type { PowerMetrics } from './types.ts'

export const HOST = '127.0.0.1'
const DEFAULT_PORT = 4300

export function parsePort(value: string | undefined): number {
  if (value === undefined) return DEFAULT_PORT
  const n = Number(value)
  if (!/^\d+$/.test(value) || n < 1 || n > 65535) throw new Error(`PORT must be a whole number from 1 to 65535, got ${JSON.stringify(value)}`)
  return n
}

// Same contract as before the move: a Node http.Server that is not listening yet.
export function createApiServer(getReading: () => Promise<PowerMetrics | null>): Server {
  return createAdaptorServer({ fetch: buildApp(getReading).fetch }) as Server
}

export function createDefaultReader(run?: RunPowermetrics): () => Promise<PowerMetrics | null> {
  const source = createPowermetricsSource(run)
  const live = createLive()
  return async () => {
    const [s, l] = await Promise.all([source(), live.get()])
    return buildReading(Date.now(), s, l)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = parsePort(process.env.PORT)
  createApiServer(createDefaultReader()).listen(port, HOST, () => console.log(`nexus-api listening on ${HOST}:${port}${POWER_PATH}`))
}
```

(Task 2 replaces that last `console.log` with the logger.)

- [ ] **Step 6: Run the new test and the whole existing API suite**

Run: `pnpm vitest run scripts/nexus-api`
Expected: PASS, including the unchanged `server.test.ts`. If the HEAD test fails (Hono answered the GET handler's 200 or 404), add a first middleware instead: `app.use(POWER_PATH, async (c, next) => c.req.method === 'GET' ? next() : sendJson(c, 405, { error: 'method_not_allowed' }, { Allow: 'GET' }))` and rerun.

- [ ] **Step 7: Make `install.sh` install the dependencies**

In `scripts/nexus-api/install.sh`, directly after the `for f in "$SRC"/src/*.ts` loop, add:

```sh
cp "$SRC/package.json" "$DEPOT/nexus-api/package.json"
# DGS-481: the API now has runtime dependencies. DGS_SKIP_PNPM=1 is for tests only (they link node_modules instead).
if [ "${DGS_SKIP_PNPM:-}" != 1 ]; then
  command -v pnpm >/dev/null 2>&1 || { echo "install: pnpm not found" >&2; exit 1; }
  (cd "$DEPOT/nexus-api" && pnpm install --prod --ignore-workspace) || { echo "install: pnpm install failed" >&2; exit 1; }
fi
```

Update the header comment's first line to say it also installs the runtime dependencies. In `scripts/nexus-api/test-install.test.ts`: pass `DGS_SKIP_PNPM: '1'` in the env of the `sh([...])` call, add `'nexus-api/package.json'` to the expected files, import `symlinkSync` from `node:fs`, and before the `'the depot copy serves the API'` test body runs, link the workspace `node_modules`:

```ts
symlinkSync(join(HERE, 'node_modules'), join(depot, 'nexus-api/node_modules'))
```

Run: `pnpm vitest run scripts/nexus-api/test-install.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -- scripts/nexus-api/src/app.ts scripts/nexus-api/src/app.test.ts scripts/nexus-api/src/server.ts scripts/nexus-api/install.sh scripts/nexus-api/test-install.test.ts
git commit -m "feat(dgs-481): move the Nexus API onto Hono" -- scripts/nexus-api/src/app.ts scripts/nexus-api/src/app.test.ts scripts/nexus-api/src/server.ts scripts/nexus-api/install.sh scripts/nexus-api/test-install.test.ts
```

---

### Task 2: Request logger and the no-console rule

**Files:**
- Create: `scripts/nexus-api/src/logger.ts`, `scripts/nexus-api/src/logger.test.ts`, `scripts/nexus-api/src/no-console.test.ts`
- Modify: `scripts/nexus-api/src/app.ts`, `scripts/nexus-api/src/server.ts`

**Interfaces:**
- Produces: `createLogger(sink?, now?): Logger` with `request(f)` and `info('listening', {host, port})`; `Env` type `{ Variables: { errorCode?: string } }`; `buildApp(getReading, deps?: { logger?: Logger })`; `createApiServer(getReading, deps?)`.
- Consumes: `buildApp`, `sendJson` from task 1.

- [ ] **Step 1: Write the failing tests**

`scripts/nexus-api/src/logger.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createLogger } from './logger.ts'

function collect() {
  const lines: string[] = []
  return { lines, logger: createLogger(l => lines.push(l), () => 0) }
}

describe('logger', () => {
  it('writes one JSON line with fixed fields', () => {
    const { lines, logger } = collect()
    logger.request({ method: 'GET', path: '/api/v1/life-calendar', status: 503, ms: 3.4, code: 'key_unavailable' })
    expect(JSON.parse(lines[0])).toEqual({ time: '1970-01-01T00:00:00.000Z', level: 'info', method: 'GET', path: '/api/v1/life-calendar', status: 503, ms: 3, code: 'key_unavailable' })
  })
  it('turns a code that is not on the list into "unknown"', () => {
    const { lines, logger } = collect()
    logger.request({ method: 'GET', path: '/x', status: 500, ms: 1, code: 'text that could hold a value' })
    expect(JSON.parse(lines[0]).code).toBe('unknown')
    expect(lines[0]).not.toContain('could hold')
  })
  it('cuts a very long path', () => {
    const { lines, logger } = collect()
    logger.request({ method: 'GET', path: '/' + 'a'.repeat(500), status: 404, ms: 1 })
    expect(JSON.parse(lines[0]).path.length).toBe(200)
  })
  it('the start-up line has host and port only', () => {
    const { lines, logger } = collect()
    logger.info('listening', { host: '127.0.0.1', port: 4300 })
    expect(JSON.parse(lines[0])).toEqual({ time: '1970-01-01T00:00:00.000Z', level: 'info', msg: 'listening', host: '127.0.0.1', port: 4300 })
  })
})
```

`scripts/nexus-api/src/no-console.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// No source file may call console.*: the logger is the only writer (spec section 10). print-sudoers.ts writes a rule, no profile data.
const ALLOWED = new Set(['logger.ts', 'print-sudoers.ts'])
describe('no console calls in the API source', () => {
  it('finds none outside logger.ts', () => {
    const dir = new URL('./', import.meta.url)
    const offenders = readdirSync(dir).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts') && !ALLOWED.has(f))
      .filter(f => /\bconsole\./.test(readFileSync(new URL(f, dir), 'utf8')))
    expect(offenders).toEqual([])
  })
})
```

Add to `app.test.ts` a logging test:

```ts
import { createLogger } from './logger.ts'
// ...
it('logs one line per request with the error code and no query string', async () => {
  const lines: string[] = []
  server = createApiServer(async () => null, { logger: createLogger(l => lines.push(l), () => 0) })
  await new Promise<void>(r => server!.listen(0, HOST, r))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  await fetch(base + PATH + '?secret=1')
  expect(lines).toHaveLength(1)
  expect(JSON.parse(lines[0])).toMatchObject({ method: 'GET', path: PATH, status: 503, code: 'no_reading' })
  expect(lines[0]).not.toContain('secret')
})
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vitest run scripts/nexus-api/src/logger.test.ts scripts/nexus-api/src/no-console.test.ts scripts/nexus-api/src/app.test.ts`
Expected: FAIL (`logger.ts` is missing; the no-console test fails on `server.ts`).

- [ ] **Step 3: Write `logger.ts`**

```ts
// The only code that writes log lines. A line has fixed fields and nothing else (spec section 10).
export type LogSink = (line: string) => void

export interface RequestFields { method: string; path: string; status: number; ms: number; code?: string }
export interface Logger {
  request(f: RequestFields): void
  info(message: 'listening', fields: { host: string; port: number }): void
}

const MAX_PATH = 200
// Only a code from this list can be logged. Anything else becomes "unknown", so no message text can leak through here.
const CODES = new Set(['profile_missing', 'profile_invalid', 'key_unavailable', 'internal_invalid', 'bad_request', 'no_reading', 'not_found', 'method_not_allowed'])

export function createLogger(sink: LogSink = line => process.stdout.write(line + '\n'), now: () => number = Date.now): Logger {
  return {
    request(f) {
      const code = f.code === undefined ? undefined : CODES.has(f.code) ? f.code : 'unknown'
      sink(JSON.stringify({ time: new Date(now()).toISOString(), level: 'info', method: String(f.method).slice(0, 10), path: String(f.path).slice(0, MAX_PATH), status: f.status, ms: Math.round(f.ms), ...(code ? { code } : {}) }))
    },
    info(message, fields) {
      sink(JSON.stringify({ time: new Date(now()).toISOString(), level: 'info', msg: message, host: fields.host, port: fields.port }))
    },
  }
}
```

- [ ] **Step 4: Wire it into `app.ts` and `server.ts`**

In `app.ts`: add `import { createLogger, type Logger } from './logger.ts'`; export `type Env = { Variables: { errorCode?: string } }`; change `sendJson` to record the code, `new Hono<Env>()`, and add the middleware and the deps parameter:

```ts
export type Env = { Variables: { errorCode?: string } }

export function sendJson(c: Context<Env, any, any>, status: ContentfulStatusCode, body: unknown, headers: Record<string, string> = {}) {
  const code = (body as { error?: unknown } | null)?.error
  if (typeof code === 'string') c.set('errorCode', code)
  return c.body(JSON.stringify(body), status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers })
}

export function buildApp(getReading: () => Promise<PowerMetrics | null>, deps: { logger?: Logger } = {}) {
  const logger = deps.logger ?? createLogger(() => {})   // silent unless the entry point passes the real one
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    const t = performance.now()
    await next()
    logger.request({ method: c.req.method, path: c.req.path, status: c.res.status, ms: performance.now() - t, code: c.get('errorCode') })
  })
  // ... the power route, notFound and onError exactly as in task 1
```

In `server.ts`: `createApiServer(getReading, deps: { logger?: Logger } = {})` passes `deps` to `buildApp`; the entry block becomes:

```ts
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = parsePort(process.env.PORT)
  const logger = createLogger()
  createApiServer(createDefaultReader(), { logger }).listen(port, HOST, () => logger.info('listening', { host: HOST, port }))
}
```

(`POWER_PATH` is no longer imported by `server.ts`; remove the import.)

- [ ] **Step 5: Run the whole API suite**

Run: `pnpm vitest run scripts/nexus-api`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -- scripts/nexus-api/src/logger.ts scripts/nexus-api/src/logger.test.ts scripts/nexus-api/src/no-console.test.ts scripts/nexus-api/src/app.ts scripts/nexus-api/src/app.test.ts scripts/nexus-api/src/server.ts
git commit -m "feat(dgs-481): add a fixed-field request logger" -- scripts/nexus-api/src/logger.ts scripts/nexus-api/src/logger.test.ts scripts/nexus-api/src/no-console.test.ts scripts/nexus-api/src/app.ts scripts/nexus-api/src/app.test.ts scripts/nexus-api/src/server.ts
```

---

### Task 3: Shared days, the life-calendar schema and the life math

**Files:**
- Create: `scripts/nexus-shared/package.json`, `scripts/nexus-shared/days.ts`, `scripts/nexus-shared/days.test.ts`, `scripts/nexus-shared/life-calendar.ts`, `scripts/nexus-shared/life-calendar.test.ts`, `scripts/nexus-api/src/life-calendar.ts`, `scripts/nexus-api/src/life-calendar.test.ts`
- Modify: `pnpm-workspace.yaml`, `scripts/nexus-api/install.sh`, `scripts/nexus-api/test-install.test.ts`

**Interfaces:**
- Produces: `parseDay(text): number`, `formatDay(day): string`, `addDays(text, n): string`, `formatShort(text)`, `formatLong(text)`, `boxRange(row, box): {from, to}` (all in `days.ts`); `lifeCalendarSchema`, `apiErrorSchema`, `API_ERROR_CODES`, `type LifeCalendar`, `type ApiErrorBody` (in `life-calendar.ts`); `computeCalendar({birthDate, lifeYears, today}): CalendarResult`, `todayUtc7(nowMs)`, `readAtUtc7(nowMs)`, `birthday(birthDate, k)` (in the API's `life-calendar.ts`).

- [ ] **Step 1: Create the shared package**

`scripts/nexus-shared/package.json`:

```json
{
  "name": "@digismith/nexus-shared",
  "private": true,
  "type": "module",
  "dependencies": {
    "zod": "4.6.7"
  }
}
```

In `pnpm-workspace.yaml` add `  - "scripts/nexus-shared"`. Run `pnpm install`.

- [ ] **Step 2: Write the failing tests**

`scripts/nexus-shared/days.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { addDays, boxRange, formatDay, formatLong, formatShort, parseDay } from './days.ts'

describe('days', () => {
  it('round-trips a date', () => { expect(formatDay(parseDay('2026-10-16'))).toBe('2026-10-16') })
  it('rejects a date that does not exist or is malformed', () => {
    for (const bad of ['2026-02-30', '2026-13-01', '2026-1-1', 'x', '']) expect(() => parseDay(bad)).toThrow('bad_date')
  })
  it('adds days across a month and a leap day', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
    expect(addDays('2024-02-28', 2)).toBe('2024-03-01')
  })
  it('formats short and long, fixed English', () => {
    expect(formatShort('2026-10-12')).toBe('12 Oct 2026')
    expect(formatLong('2026-10-12')).toBe('12 October 2026')
  })
  it('box ranges: seven days, and the last box takes the row end', () => {
    const row = { start: '2026-01-01', end: '2026-12-31' }
    expect(boxRange(row, 0)).toEqual({ from: '2026-01-01', to: '2026-01-07' })
    expect(boxRange(row, 41)).toEqual({ from: '2026-10-15', to: '2026-10-21' })
    expect(boxRange(row, 51)).toEqual({ from: '2026-12-24', to: '2026-12-31' })
  })
})
```

`scripts/nexus-shared/life-calendar.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { apiErrorSchema, lifeCalendarSchema } from './life-calendar.ts'

const good = {
  readAt: '2026-10-16T14:00:00.000Z', readAtUtc7: '2026-10-16 21:00:00', today: '2026-10-16', timezone: 'UTC+7',
  totals: { weeksTotal: 52, weeksLived: 10, weeksLeft: 41, percentLived: 19.2 },
  current: { row: 0, box: 10 },
  rows: [{ age: 0, start: '2026-01-01', end: '2026-12-31', lived: 10 }],
}

describe('life-calendar schema', () => {
  it('accepts a good body and a null current', () => {
    expect(lifeCalendarSchema.safeParse(good).success).toBe(true)
    expect(lifeCalendarSchema.safeParse({ ...good, current: null }).success).toBe(true)
  })
  it('is strict: any extra key is rejected, including a birth-date key', () => {
    expect(lifeCalendarSchema.safeParse({ ...good, birthDate: '2000-01-01' }).success).toBe(false)
    expect(lifeCalendarSchema.safeParse({ ...good, rows: [{ ...good.rows[0], born: 'x' }] }).success).toBe(false)
  })
  it('rejects a bad lived count and a bad date', () => {
    expect(lifeCalendarSchema.safeParse({ ...good, rows: [{ ...good.rows[0], lived: 53 }] }).success).toBe(false)
    expect(lifeCalendarSchema.safeParse({ ...good, today: '16-10-2026' }).success).toBe(false)
  })
  it('has no field whose name suggests a birth date', () => {
    const names = JSON.stringify(Object.keys(lifeCalendarSchema.shape)) + JSON.stringify(Object.keys(lifeCalendarSchema.shape.rows.element.shape))
    expect(names).not.toMatch(/birth|born|dob/i)
  })
  it('the error body schema takes a known code and no extra key', () => {
    expect(apiErrorSchema.safeParse({ error: 'key_unavailable' }).success).toBe(true)
    expect(apiErrorSchema.safeParse({ error: 'no_reading', message: 'x' }).success).toBe(true)
    expect(apiErrorSchema.safeParse({ error: 'made_up' }).success).toBe(false)
    expect(apiErrorSchema.safeParse({ error: 'not_found', detail: 'x' }).success).toBe(false)
  })
})
```

`scripts/nexus-api/src/life-calendar.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { birthday, computeCalendar, readAtUtc7, todayUtc7 } from './life-calendar.ts'
import { formatDay } from '../../nexus-shared/days.ts'

const FAKE = { birthDate: '1990-01-01', lifeYears: 90 }   // fake profile: tests never use a real date

describe('computeCalendar', () => {
  it('matches the Designer mock for 2026-10-16: 1,913 lived, 2,766 left, 40.9%, this week at row 36 box 41', () => {
    const r = computeCalendar({ ...FAKE, today: '2026-10-16' })
    expect(r.totals).toEqual({ weeksTotal: 4680, weeksLived: 1913, weeksLeft: 2766, percentLived: 40.9 })
    expect(r.current).toEqual({ row: 36, box: 41 })
    expect(r.rows[36]).toEqual({ age: 36, start: '2026-01-01', end: '2026-12-31', lived: 41 })
    expect(r.rows[0]).toEqual({ age: 0, start: '1990-01-01', end: '1990-12-31', lived: 52 })
    expect(r.rows[37].lived).toBe(0)
  })
  it('the totals always add up: lived + left + (this week) = rows x 52', () => {
    for (const today of ['1990-01-01', '2000-06-15', '2026-12-31', '2027-01-01', '2079-12-31']) {
      const r = computeCalendar({ ...FAKE, today })
      expect(r.totals.weeksLived + r.totals.weeksLeft + (r.current ? 1 : 0)).toBe(4680)
    }
  })
  it('on the birthday the new row starts at box 0; the day before, the old row is at its last box', () => {
    expect(computeCalendar({ ...FAKE, today: '2027-01-01' }).current).toEqual({ row: 37, box: 0 })
    expect(computeCalendar({ ...FAKE, today: '2026-12-31' }).current).toEqual({ row: 36, box: 51 })
  })
  it('the leftover day of a 365-day year falls into box 51', () => {
    // 1990-01-01 + 364 days = 1990-12-31: day 364 => floor(364/7) = 52, clamped to box 51
    expect(computeCalendar({ ...FAKE, today: '1990-12-31' }).current).toEqual({ row: 0, box: 51 })
  })
  it('before birth: nothing lived, no current box', () => {
    const r = computeCalendar({ ...FAKE, today: '1989-12-31' })
    expect(r.current).toBeNull()
    expect(r.totals).toEqual({ weeksTotal: 4680, weeksLived: 0, weeksLeft: 4680, percentLived: 0 })
  })
  it('past the last row: all lived, no current box, 100%', () => {
    const r = computeCalendar({ ...FAKE, today: '2080-01-01' })
    expect(r.current).toBeNull()
    expect(r.totals).toEqual({ weeksTotal: 4680, weeksLived: 4680, weeksLeft: 0, percentLived: 100 })
  })
  it('a 29 February birthday counts as 1 March in a non-leap year', () => {
    expect(formatDay(birthday('1992-02-29', 1))).toBe('1993-03-01')
    expect(formatDay(birthday('1992-02-29', 4))).toBe('1996-02-29')
    const r = computeCalendar({ birthDate: '1992-02-29', lifeYears: 3, today: '1993-02-28' })
    expect(r.rows[0].end).toBe('1993-02-28')   // the day before 1993-03-01
    expect(r.rows[1].start).toBe('1993-03-01')
  })
  it('rejects a date that does not exist', () => {
    expect(() => computeCalendar({ birthDate: '1990-02-30', lifeYears: 90, today: '2026-10-16' })).toThrow('bad_date')
  })
})

describe('UTC+7 time', () => {
  it('today is the UTC+7 day: 17:30 UTC is already the next day', () => {
    expect(todayUtc7(Date.parse('2026-10-16T16:59:59Z'))).toBe('2026-10-16')
    expect(todayUtc7(Date.parse('2026-10-16T17:00:00Z'))).toBe('2026-10-17')
  })
  it('readAtUtc7 is the same moment as "YYYY-MM-DD HH:MM:SS"', () => {
    expect(readAtUtc7(Date.parse('2026-10-16T14:00:00Z'))).toBe('2026-10-16 21:00:00')
  })
})
```

- [ ] **Step 3: Run to see them fail**

Run: `pnpm vitest run scripts/nexus-shared scripts/nexus-api/src/life-calendar.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 4: Write the three modules**

`scripts/nexus-shared/days.ts`:

```ts
// Date-only helpers shared by the API and the page. A "day" is a whole number of days since 1970-01-01 (UTC calendar).
const DAY_MS = 86_400_000
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function parseDay(text: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!m) throw new Error('bad_date')
  const day = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS
  if (formatDay(day) !== text) throw new Error('bad_date')   // rejects 2026-02-30 and the like
  return day
}
export function formatDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}
export function addDays(text: string, n: number): string {
  return formatDay(parseDay(text) + n)
}
// "12 Oct 2026" (tooltip) and "12 October 2026" (accessible name). Fixed English, no locale.
export function formatShort(text: string): string {
  const [y, m, d] = text.split('-').map(Number)
  return `${d} ${SHORT[m - 1]} ${y}`
}
export function formatLong(text: string): string {
  const [y, m, d] = text.split('-').map(Number)
  return `${d} ${LONG[m - 1]} ${y}`
}
// The date range of box j in a row: 7 days from start+7j; the last box (51) ends on the row's end day.
export function boxRange(row: { start: string; end: string }, box: number): { from: string; to: string } {
  const from = addDays(row.start, box * 7)
  const to = box >= 51 ? row.end : addDays(from, 6)
  return { from, to }
}
```

`scripts/nexus-shared/life-calendar.ts`:

```ts
import { z } from 'zod'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const count = z.number().int().min(0)

// The JSON of GET /api/v1/life-calendar. Strict: an unknown key, including any birth-date key, fails validation.
export const lifeCalendarSchema = z.strictObject({
  readAt: z.string(),
  readAtUtc7: z.string(),
  today: day,
  timezone: z.literal('UTC+7'),
  totals: z.strictObject({
    weeksTotal: count.min(1),
    weeksLived: count,
    weeksLeft: count,
    percentLived: z.number().min(0).max(100),
  }),
  current: z.strictObject({ row: count, box: count.max(51) }).nullable(),
  rows: z.array(z.strictObject({ age: count, start: day, end: day, lived: count.max(52) })).min(1),
})
export type LifeCalendar = z.infer<typeof lifeCalendarSchema>

export const API_ERROR_CODES = ['profile_missing', 'profile_invalid', 'key_unavailable', 'internal_invalid', 'bad_request', 'no_reading', 'not_found', 'method_not_allowed'] as const
export const apiErrorSchema = z.strictObject({ error: z.enum(API_ERROR_CODES), message: z.string().optional() })
export type ApiErrorBody = z.infer<typeof apiErrorSchema>
```

`scripts/nexus-api/src/life-calendar.ts`:

```ts
// Pure life-calendar math. Date-only, UTC+7 "today". No I/O.
import { formatDay, parseDay } from '../../nexus-shared/days.ts'

export interface CalendarInput { birthDate: string; lifeYears: number; today: string }
export interface CalendarRow { age: number; start: string; end: string; lived: number }
export interface CalendarResult {
  totals: { weeksTotal: number; weeksLived: number; weeksLeft: number; percentLived: number }
  current: { row: number; box: number } | null
  rows: CalendarRow[]
}

const DAY = 86_400_000
const BOXES = 52

function isLeap(y: number): boolean { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 }

// The k-th birthday as a day number. A 29 February birthday falls on 1 March in non-leap years.
export function birthday(birthDate: string, k: number): number {
  const [y, m, d] = birthDate.split('-').map(Number)
  const year = y + k
  if (m === 2 && d === 29 && !isLeap(year)) return Date.UTC(year, 2, 1) / DAY
  return Date.UTC(year, m - 1, d) / DAY
}

export function computeCalendar({ birthDate, lifeYears, today }: CalendarInput): CalendarResult {
  const now = parseDay(today)
  parseDay(birthDate)
  const rows: CalendarRow[] = []
  let current: CalendarResult['current'] = null
  let lived = 0
  for (let k = 0; k < lifeYears; k++) {
    const start = birthday(birthDate, k)
    const end = birthday(birthDate, k + 1) - 1
    let rowLived = 0
    if (now > end) rowLived = BOXES
    else if (now >= start) {
      const box = Math.min(BOXES - 1, Math.floor((now - start) / 7))
      rowLived = box
      current = { row: k, box }
    }
    lived += rowLived
    rows.push({ age: k, start: formatDay(start), end: formatDay(end), lived: rowLived })
  }
  const weeksTotal = lifeYears * BOXES
  const weeksLeft = weeksTotal - lived - (current ? 1 : 0)
  return { totals: { weeksTotal, weeksLived: lived, weeksLeft, percentLived: Math.round((lived / weeksTotal) * 1000) / 10 }, current, rows }
}

export function todayUtc7(nowMs: number): string {
  return new Date(nowMs + 7 * 3_600_000).toISOString().slice(0, 10)
}
export function readAtUtc7(nowMs: number): string {
  return new Date(nowMs + 7 * 3_600_000).toISOString().slice(0, 19).replace('T', ' ')
}
```

- [ ] **Step 5: Copy `nexus-shared` in `install.sh`**

In `scripts/nexus-api/install.sh`, after the `package.json` copy added in task 1, add:

```sh
# DGS-481: the shared schema sits next to the API in the depot, so ../../nexus-shared/ resolves the same as in the repo.
mkdir -p "$DEPOT/nexus-shared"
for f in "$SRC"/../nexus-shared/*.ts; do
  case "$f" in *.test.ts) continue;; esac
  cp "$f" "$DEPOT/nexus-shared/"
done
cp "$SRC/../nexus-shared/package.json" "$DEPOT/nexus-shared/package.json"
# the shared files import zod: point them at the API's node_modules (one install, no second copy)
rm -rf "$DEPOT/nexus-shared/node_modules"; ln -s ../nexus-api/node_modules "$DEPOT/nexus-shared/node_modules"
```

In `test-install.test.ts` add `'nexus-shared/days.ts'` and `'nexus-shared/life-calendar.ts'` to the expected files, and a test that no `*.test.ts` file is in `nexus-shared`.

- [ ] **Step 6: Run everything**

Run: `pnpm vitest run scripts/nexus-shared scripts/nexus-api`
Expected: PASS. Also run `node --experimental-strip-types -e "import('./scripts/nexus-api/src/life-calendar.ts').then(m => console.log(m.computeCalendar({birthDate:'1990-01-01',lifeYears:90,today:'2026-10-16'}).totals))"` and expect `weeksLived: 1913`.

- [ ] **Step 7: Commit**

```bash
git add -- scripts/nexus-shared pnpm-workspace.yaml pnpm-lock.yaml scripts/nexus-api/src/life-calendar.ts scripts/nexus-api/src/life-calendar.test.ts scripts/nexus-api/install.sh scripts/nexus-api/test-install.test.ts
git commit -m "feat(dgs-481): add the shared schema, day helpers and life math" -- scripts/nexus-shared pnpm-workspace.yaml pnpm-lock.yaml scripts/nexus-api/src/life-calendar.ts scripts/nexus-api/src/life-calendar.test.ts scripts/nexus-api/install.sh scripts/nexus-api/test-install.test.ts
```

---

### Task 4: Profile crypto and the file key provider

**Files:**
- Create: `scripts/nexus-api/src/profile-crypto.ts`, `scripts/nexus-api/src/profile-crypto.test.ts`, `scripts/nexus-api/src/key-provider.ts`, `scripts/nexus-api/src/key-provider.test.ts`

**Interfaces:**
- Produces: `type Profile = { birthDate: string; lifeYears: number }`; `type Sealed = { nonce: Buffer; ciphertext: Buffer }`; `KEY_BYTES = 32`; `seal(profile, key): Sealed`; `open(sealed, key): Profile`; `class CryptoError { code: 'bad_key' | 'decrypt_failed' | 'bad_profile' }`; `interface KeyProvider { getKey(): Promise<Buffer> }`; `fileKeyProvider(path, { create? })`; `selectKeyProvider(name, { keyFile }, { create? })`; `class KeyError { code: 'key_unavailable' }`.

- [ ] **Step 1: Write the failing tests**

`scripts/nexus-api/src/profile-crypto.test.ts`:

```ts
import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { CryptoError, open, seal } from './profile-crypto.ts'

const FAKE = { birthDate: '1990-01-01', lifeYears: 90 }   // fake profile
const key = randomBytes(32)

describe('profile crypto (AES-256-GCM)', () => {
  it('round-trips', () => { expect(open(seal(FAKE, key), key)).toEqual(FAKE) })
  it('uses a new nonce every time, so the same profile gives different bytes', () => {
    const a = seal(FAKE, key), b = seal(FAKE, key)
    expect(a.nonce.equals(b.nonce)).toBe(false)
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false)
  })
  it('the ciphertext holds neither the date nor the field names as plain text', () => {
    const s = seal(FAKE, key).ciphertext.toString('latin1')
    expect(s).not.toContain('1990')
    expect(s).not.toContain('birthDate')
  })
  it.each([
    ['a changed ciphertext byte', (s: ReturnType<typeof seal>) => { const c = Buffer.from(s.ciphertext); c[0] ^= 1; return { ...s, ciphertext: c } }],
    ['a changed tag byte', (s: ReturnType<typeof seal>) => { const c = Buffer.from(s.ciphertext); c[c.length - 1] ^= 1; return { ...s, ciphertext: c } }],
    ['a changed nonce', (s: ReturnType<typeof seal>) => { const n = Buffer.from(s.nonce); n[0] ^= 1; return { ...s, nonce: n } }],
    ['a truncated blob', (s: ReturnType<typeof seal>) => ({ ...s, ciphertext: s.ciphertext.subarray(0, 8) })],
  ])('fails with decrypt_failed for %s', (_n, tamper) => {
    expect(() => open(tamper(seal(FAKE, key)), key)).toThrowError(expect.objectContaining({ code: 'decrypt_failed' }))
  })
  it('fails with decrypt_failed for a wrong key', () => {
    expect(() => open(seal(FAKE, key), randomBytes(32))).toThrowError(expect.objectContaining({ code: 'decrypt_failed' }))
  })
  it('rejects a key that is not 32 bytes', () => {
    expect(() => seal(FAKE, Buffer.alloc(16))).toThrowError(expect.objectContaining({ code: 'bad_key' }))
    expect(() => open(seal(FAKE, key), Buffer.alloc(16))).toThrowError(expect.objectContaining({ code: 'bad_key' }))
  })
  it('an error carries a code only, never the profile values or the key', () => {
    try { open(seal(FAKE, key), randomBytes(32)) } catch (e) {
      expect(e).toBeInstanceOf(CryptoError)
      expect((e as Error).message).toBe('decrypt_failed')
      expect(String((e as Error).stack)).not.toContain('1990')
    }
  })
})
```

`scripts/nexus-api/src/key-provider.test.ts`:

```ts
import { chmodSync, mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fileKeyProvider, KeyError, selectKeyProvider } from './key-provider.ts'

const dir = () => mkdtempSync(join(tmpdir(), 'nexus-key-'))

describe('file key provider', () => {
  it('fails with key_unavailable when the file is missing and create is off', async () => {
    await expect(fileKeyProvider(join(dir(), 'profile.key')).getKey()).rejects.toMatchObject({ code: 'key_unavailable' })
  })
  it('creates a 32-byte key with mode 600 when create is on, and never overwrites it', async () => {
    const f = join(dir(), 'sub', 'profile.key')
    const k1 = await fileKeyProvider(f, { create: true }).getKey()
    const k2 = await fileKeyProvider(f, { create: true }).getKey()
    expect(k1).toHaveLength(32)
    expect(k1.equals(k2)).toBe(true)
    expect(statSync(f).mode & 0o777).toBe(0o600)
  })
  it('refuses a key file that other users can read', async () => {
    const f = join(dir(), 'profile.key')
    await fileKeyProvider(f, { create: true }).getKey()
    chmodSync(f, 0o644)
    await expect(fileKeyProvider(f).getKey()).rejects.toBeInstanceOf(KeyError)
  })
  it('refuses a key file of the wrong length', async () => {
    const f = join(dir(), 'profile.key')
    writeFileSync(f, Buffer.alloc(5), { mode: 0o600 })
    await expect(fileKeyProvider(f).getKey()).rejects.toMatchObject({ code: 'key_unavailable' })
  })
})

describe('selectKeyProvider', () => {
  it('defaults to the file provider', async () => {
    const f = join(dir(), 'profile.key')
    const key = await selectKeyProvider(undefined, { keyFile: f }, { create: true }).getKey()
    expect(key).toHaveLength(32)
  })
  it('keychain is not available yet: it fails closed', async () => {
    await expect(Promise.resolve().then(() => selectKeyProvider('keychain', { keyFile: '/nowhere' }))).rejects.toMatchObject({ code: 'key_unavailable' })
  })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vitest run scripts/nexus-api/src/profile-crypto.test.ts scripts/nexus-api/src/key-provider.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Write `profile-crypto.ts`**

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const AAD = Buffer.from('nexus-profile:v1')
export const KEY_BYTES = 32
export const NONCE_BYTES = 12
const TAG_BYTES = 16

export interface Profile { birthDate: string; lifeYears: number }
export interface Sealed { nonce: Buffer; ciphertext: Buffer }   // ciphertext = encrypted blob followed by the 16-byte tag

// Errors carry a code only. No message is ever built from data.
export class CryptoError extends Error {
  readonly code: 'bad_key' | 'decrypt_failed' | 'bad_profile'
  constructor(code: 'bad_key' | 'decrypt_failed' | 'bad_profile') { super(code); this.code = code }
}

export function seal(profile: Profile, key: Buffer): Sealed {
  if (key.length !== KEY_BYTES) throw new CryptoError('bad_key')
  const nonce = randomBytes(NONCE_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(AAD)
  const body = Buffer.concat([cipher.update(JSON.stringify(profile), 'utf8'), cipher.final()])
  return { nonce, ciphertext: Buffer.concat([body, cipher.getAuthTag()]) }
}

export function open(sealed: Sealed, key: Buffer): Profile {
  if (key.length !== KEY_BYTES) throw new CryptoError('bad_key')
  if (sealed.nonce.length !== NONCE_BYTES || sealed.ciphertext.length <= TAG_BYTES) throw new CryptoError('decrypt_failed')
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, sealed.nonce)
    decipher.setAAD(AAD)
    decipher.setAuthTag(sealed.ciphertext.subarray(sealed.ciphertext.length - TAG_BYTES))
    const text = Buffer.concat([decipher.update(sealed.ciphertext.subarray(0, sealed.ciphertext.length - TAG_BYTES)), decipher.final()]).toString('utf8')
    const value = JSON.parse(text) as Partial<Profile>
    if (typeof value.birthDate !== 'string' || typeof value.lifeYears !== 'number') throw new CryptoError('bad_profile')
    return { birthDate: value.birthDate, lifeYears: value.lifeYears }
  } catch (e) {
    if (e instanceof CryptoError) throw e
    throw new CryptoError('decrypt_failed')
  }
}
```

- [ ] **Step 4: Write `key-provider.ts`**

```ts
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes } from 'node:crypto'
import { KEY_BYTES } from './profile-crypto.ts'

export class KeyError extends Error {
  readonly code = 'key_unavailable' as const
  constructor() { super('key_unavailable') }
}
export interface KeyProvider { getKey(): Promise<Buffer> }

// The key file: 32 raw bytes, mode 600. create=true (the seed step only) makes it when missing and never overwrites one.
export function fileKeyProvider(path: string, opts: { create?: boolean } = {}): KeyProvider {
  return {
    async getKey() {
      if (!existsSync(path)) {
        if (!opts.create) throw new KeyError()
        mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
        writeFileSync(path, randomBytes(KEY_BYTES), { flag: 'wx', mode: 0o600 })
        chmodSync(path, 0o600)
      }
      if ((statSync(path).mode & 0o077) !== 0) throw new KeyError()
      const key = readFileSync(path)
      if (key.length !== KEY_BYTES) throw new KeyError()
      return key
    },
  }
}

// NEXUS_KEY_PROVIDER picks the provider. 'keychain' arrives with its own task; until then it fails closed.
export function selectKeyProvider(name: string | undefined, paths: { keyFile: string }, opts: { create?: boolean } = {}): KeyProvider {
  if (name === undefined || name === 'file') return fileKeyProvider(paths.keyFile, opts)
  throw new KeyError()
}
```

- [ ] **Step 5: Run to see them pass**

Run: `pnpm vitest run scripts/nexus-api/src/profile-crypto.test.ts scripts/nexus-api/src/key-provider.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -- scripts/nexus-api/src/profile-crypto.ts scripts/nexus-api/src/profile-crypto.test.ts scripts/nexus-api/src/key-provider.ts scripts/nexus-api/src/key-provider.test.ts
git commit -m "feat(dgs-481): add the profile crypto and the file key provider" -- scripts/nexus-api/src/profile-crypto.ts scripts/nexus-api/src/profile-crypto.test.ts scripts/nexus-api/src/key-provider.ts scripts/nexus-api/src/key-provider.test.ts
```

---
### Task 5: PGlite profile store

**Files:**
- Create: `scripts/nexus-api/src/profile-store.ts`, `scripts/nexus-api/src/profile-store.test.ts`

**Interfaces:**
- Consumes: `Sealed` from `profile-crypto.ts`.
- Produces: `openStore(dataDir: string | undefined, opts?: { create?: boolean }): Promise<ProfileStore>` (`undefined` = in memory, for tests); `interface ProfileStore { save(sealed: Sealed, keyVersion: number): Promise<void>; load(): Promise<Sealed | null>; close(): Promise<void> }`; `class StoreError { code: 'profile_missing' | 'profile_invalid' }`.

- [ ] **Step 1: Confirm the PGlite API names**

Run from `scripts/nexus-api`: `node -e "import('@electric-sql/pglite').then(async m => { const db = new m.PGlite(); await db.waitReady; await db.exec('create table t (b bytea)'); await db.query('insert into t values (\$1)', [Buffer.from([1,2,3])]); const r = await db.query('select b from t'); console.log(r.rows[0].b); await db.close() })"`
Expected: prints a `Uint8Array` with 1, 2, 3 (or `Buffer`). If the API differs in 0.5.10 (for example `query` returns another shape), adapt the code below and tell the Maestro. Keep the exported interface exactly as above.

- [ ] **Step 2: Write the failing tests**

`scripts/nexus-api/src/profile-store.test.ts`:

```ts
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { seal } from './profile-crypto.ts'
import { openStore, StoreError } from './profile-store.ts'
import { randomBytes } from 'node:crypto'

const FAKE = { birthDate: '1990-01-01', lifeYears: 90 }   // fake profile
const key = randomBytes(32)
const T = 60_000   // PGlite starts a WebAssembly Postgres; allow it time

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)])
}

describe('profile store (in memory)', () => {
  it('load is null on an empty database', async () => {
    const s = await openStore(undefined)
    expect(await s.load()).toBeNull()
    await s.close()
  }, T)
  it('save then load returns the same bytes; a second save replaces the first', async () => {
    const s = await openStore(undefined)
    const a = seal(FAKE, key), b = seal({ ...FAKE, lifeYears: 80 }, key)
    await s.save(a, 1)
    const got = await s.load()
    expect(got?.nonce.equals(a.nonce)).toBe(true)
    expect(got?.ciphertext.equals(a.ciphertext)).toBe(true)
    await s.save(b, 1)
    expect((await s.load())?.nonce.equals(b.nonce)).toBe(true)
    await s.close()
  }, T)
})

describe('profile store (a real data folder)', () => {
  it('creates the folder with mode 700, keeps the data across a reopen, and holds no plain-text date', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'nexus-db-')), 'db')
    const s = await openStore(dir, { create: true })
    expect(statSync(dir).mode & 0o777).toBe(0o700)
    await s.save(seal(FAKE, key), 1)
    await s.close()
    const again = await openStore(dir, { create: false })
    expect(await again.load()).not.toBeNull()
    await again.close()
    for (const f of filesUnder(dir)) expect(readFileSync(f).includes(Buffer.from('1990-01-01')), f).toBe(false)
  }, T)
  it('the API open (create false) says profile_missing for a missing folder and creates nothing', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'nexus-db-')), 'db')
    await expect(openStore(dir, { create: false })).rejects.toMatchObject({ code: 'profile_missing' })
    expect(() => statSync(dir)).toThrow()
  }, T)
  it('the API open says profile_invalid when the folder can be read by others', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'nexus-db-')), 'db')
    mkdirSync(dir, { mode: 0o755 }); chmodSync(dir, 0o755)
    await expect(openStore(dir, { create: false })).rejects.toBeInstanceOf(StoreError)
    await expect(openStore(dir, { create: false })).rejects.toMatchObject({ code: 'profile_invalid' })
  }, T)
})
```

- [ ] **Step 3: Run to see them fail**

Run: `pnpm vitest run scripts/nexus-api/src/profile-store.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 4: Write `profile-store.ts`**

```ts
import { PGlite } from '@electric-sql/pglite'
import { chmodSync, existsSync, mkdirSync, statSync } from 'node:fs'
import type { Sealed } from './profile-crypto.ts'

export class StoreError extends Error {
  readonly code: 'profile_missing' | 'profile_invalid'
  constructor(code: 'profile_missing' | 'profile_invalid') { super(code); this.code = code }
}

export interface ProfileStore {
  save(sealed: Sealed, keyVersion: number): Promise<void>
  load(): Promise<Sealed | null>
  close(): Promise<void>
}

const SCHEMA = `CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  key_version INTEGER NOT NULL,
  nonce BYTEA NOT NULL,
  ciphertext BYTEA NOT NULL
)`

// dataDir undefined = in memory (tests). create=true (the seed step): make the folder with mode 700.
// create=false (the API): the folder must already exist and must be mode 700, or the profile is missing or invalid; nothing is created.
export async function openStore(dataDir: string | undefined, opts: { create?: boolean } = {}): Promise<ProfileStore> {
  if (dataDir !== undefined) {
    if (opts.create) {
      mkdirSync(dataDir, { recursive: true, mode: 0o700 })
      chmodSync(dataDir, 0o700)
    } else {
      if (!existsSync(dataDir)) throw new StoreError('profile_missing')
      if ((statSync(dataDir).mode & 0o077) !== 0) throw new StoreError('profile_invalid')
    }
  }
  const db = dataDir === undefined ? new PGlite() : new PGlite(dataDir)
  await db.waitReady
  await db.exec(SCHEMA)
  return {
    async save(sealed, keyVersion) {
      await db.query(
        'INSERT INTO profile (id, key_version, nonce, ciphertext) VALUES (1, $1, $2, $3) ON CONFLICT (id) DO UPDATE SET key_version = EXCLUDED.key_version, nonce = EXCLUDED.nonce, ciphertext = EXCLUDED.ciphertext',
        [keyVersion, sealed.nonce, sealed.ciphertext],
      )
    },
    async load() {
      const r = await db.query<{ nonce: Uint8Array; ciphertext: Uint8Array }>('SELECT nonce, ciphertext FROM profile WHERE id = 1')
      const row = r.rows[0]
      return row ? { nonce: Buffer.from(row.nonce), ciphertext: Buffer.from(row.ciphertext) } : null
    },
    async close() { await db.close() },
  }
}
```

- [ ] **Step 5: Run to see them pass**

Run: `pnpm vitest run scripts/nexus-api/src/profile-store.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -- scripts/nexus-api/src/profile-store.ts scripts/nexus-api/src/profile-store.test.ts
git commit -m "feat(dgs-481): add the PGlite profile store" -- scripts/nexus-api/src/profile-store.ts scripts/nexus-api/src/profile-store.test.ts
```

---

### Task 6: The seed step

**Files:**
- Create: `scripts/nexus-api/seed-profile.ts`, `scripts/nexus-api/seed-profile.test.ts`

**Interfaces:**
- Consumes: `seal`, `Profile` (task 4), `fileKeyProvider` (task 4), `openStore` (task 5), `parseDay` (task 3), `todayUtc7` (task 3).
- Produces: `seed(opts: { inputPath: string; dataDir: string; keyFile: string; now?: number }): Promise<void>`; `class SeedError { step: string }`; the CLI (`node --experimental-strip-types scripts/nexus-api/seed-profile.ts`) prints nothing on success, `seed failed: <step>` on stderr and exit code 1 on failure. Depot defaults: input `$D/nexus/profile.private.json`, data folder `$D/nexus/db`, key `$D/nexus/profile.key`, where `$D` is `DIGISMITH_DEPOT` or `~/.digismith-depot`.

- [ ] **Step 1: Write the failing tests**

`scripts/nexus-api/seed-profile.test.ts`:

```ts
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { open } from './src/profile-crypto.ts'
import { openStore } from './src/profile-store.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const FAKE = { birthDate: '1990-01-01', lifeYears: 90 }   // fake profile
const T = 90_000

function depot(input: unknown, mode = 0o600) {
  const d = mkdtempSync(join(tmpdir(), 'nexus-seed-'))
  mkdirSync(join(d, 'nexus'), { recursive: true })
  const f = join(d, 'nexus', 'profile.private.json')
  writeFileSync(f, typeof input === 'string' ? input : JSON.stringify(input), { mode })
  chmodSync(f, mode)
  return d
}
const run = (d: string) => spawnSync('node', ['--experimental-strip-types', join(HERE, 'seed-profile.ts')], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '', HOME: d, DIGISMITH_DEPOT: d } })

describe('seed step', () => {
  it('prints nothing on success, creates the key (600) and the encrypted row, and leaves the input untouched', async () => {
    const d = depot(FAKE)
    const before = readFileSync(join(d, 'nexus/profile.private.json'), 'utf8')
    const r = run(d)
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toBe('')
    expect(r.stderr).toBe('')
    expect(readFileSync(join(d, 'nexus/profile.private.json'), 'utf8')).toBe(before)
    expect(statSync(join(d, 'nexus/profile.private.json')).mode & 0o777).toBe(0o600)
    expect(statSync(join(d, 'nexus/profile.key')).mode & 0o777).toBe(0o600)
    const s = await openStore(join(d, 'nexus/db'), { create: false })
    const sealed = await s.load()
    await s.close()
    expect(open(sealed!, readFileSync(join(d, 'nexus/profile.key')))).toEqual(FAKE)
  }, T)
  it('a second run keeps the same key and replaces the row', () => {
    const d = depot(FAKE)
    expect(run(d).status).toBe(0)
    const key1 = readFileSync(join(d, 'nexus/profile.key'))
    writeFileSync(join(d, 'nexus/profile.private.json'), JSON.stringify({ ...FAKE, lifeYears: 85 }))
    expect(run(d).status).toBe(0)
    expect(readFileSync(join(d, 'nexus/profile.key')).equals(key1)).toBe(true)
  }, T)
  it.each([
    ['input_mode', () => depot(FAKE, 0o644)],
    ['input_missing', () => mkdtempSync(join(tmpdir(), 'nexus-seed-'))],
    ['input_json', () => depot('not json')],
    ['field:birthDate', () => depot({ ...FAKE, birthDate: '1990-02-30' })],
    ['field:birthDate', () => depot({ ...FAKE, birthDate: '2999-01-01' })],
    ['field:lifeYears', () => depot({ ...FAKE, lifeYears: 0 })],
    ['field:lifeYears', () => depot({ ...FAKE, lifeYears: '90' })],
    ['input_invalid', () => depot({ ...FAKE, extra: 1 })],
  ])('fails with "%s", exit 1, and prints no value', (step, make) => {
    const r = run(make())
    expect(r.status).toBe(1)
    expect(r.stdout).toBe('')
    expect(r.stderr).toBe(`seed failed: ${step}\n`)
    expect(r.stderr).not.toContain('1990')
  }, T)
  it('does not create a key or a database when the input is bad', () => {
    const d = depot({ ...FAKE, lifeYears: 0 })
    run(d)
    expect(existsSync(join(d, 'nexus/profile.key'))).toBe(false)
    expect(existsSync(join(d, 'nexus/db'))).toBe(false)
  }, T)
})
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vitest run scripts/nexus-api/seed-profile.test.ts`
Expected: FAIL (script missing).

- [ ] **Step 3: Write `seed-profile.ts`**

```ts
// The seed step (DGS-481). Reads the private input, encrypts it, stores it. Prints nothing on success; on failure only the step name.
// It never prints a value or a key, and never changes or deletes the input file.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { parseDay } from '../nexus-shared/days.ts'
import { fileKeyProvider } from './src/key-provider.ts'
import { todayUtc7 } from './src/life-calendar.ts'
import { seal } from './src/profile-crypto.ts'
import { openStore } from './src/profile-store.ts'

export class SeedError extends Error {
  readonly step: string
  constructor(step: string) { super(step); this.step = step }
}

// Private to the API folder: never shared with the page.
const inputSchema = z.strictObject({ birthDate: z.string(), lifeYears: z.number().int().min(1).max(120) })

export interface SeedOptions { inputPath: string; dataDir: string; keyFile: string; now?: number }

export async function seed(opts: SeedOptions): Promise<void> {
  if (!existsSync(opts.inputPath)) throw new SeedError('input_missing')
  if ((statSync(opts.inputPath).mode & 0o077) !== 0) throw new SeedError('input_mode')
  let raw: unknown
  try { raw = JSON.parse(readFileSync(opts.inputPath, 'utf8')) } catch { throw new SeedError('input_json') }
  const parsed = inputSchema.safeParse(raw)
  if (!parsed.success) {
    // Only the field NAME, never a value or a Zod message.
    const field = parsed.error.issues[0]?.path[0]
    throw new SeedError(typeof field === 'string' ? `field:${field}` : 'input_invalid')
  }
  const profile = parsed.data
  try {
    const day = parseDay(profile.birthDate)
    if (day > parseDay(todayUtc7(opts.now ?? Date.now()))) throw new Error('future')
  } catch { throw new SeedError('field:birthDate') }
  let key: Buffer
  try { key = await fileKeyProvider(opts.keyFile, { create: true }).getKey() } catch { throw new SeedError('key') }
  const sealed = seal(profile, key)
  let store
  try { store = await openStore(opts.dataDir, { create: true }) } catch { throw new SeedError('store') }
  try { await store.save(sealed, 1) } catch { throw new SeedError('store') } finally { await store.close() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const d = process.env.DIGISMITH_DEPOT ?? join(homedir(), '.digismith-depot')
  seed({ inputPath: join(d, 'nexus', 'profile.private.json'), dataDir: join(d, 'nexus', 'db'), keyFile: join(d, 'nexus', 'profile.key') })
    .then(() => process.exit(0))
    .catch(e => { process.stderr.write(`seed failed: ${e instanceof SeedError ? e.step : 'unexpected'}\n`); process.exit(1) })
}
```

- [ ] **Step 4: Run to see them pass**

Run: `pnpm vitest run scripts/nexus-api/seed-profile.test.ts`
Expected: PASS. (Each test spawns PGlite; the file takes a while.)

- [ ] **Step 5: Copy the seed script in `install.sh`**

After the `nexus-shared` copy added in task 3, add: `cp "$SRC/seed-profile.ts" "$DEPOT/nexus-api/seed-profile.ts"`. The depot path `$DEPOT/nexus-api/seed-profile.ts` imports `../nexus-shared/days.ts` and `./src/...`, the same layout as the repo. Add `'nexus-api/seed-profile.ts'` to the expected files in `test-install.test.ts` and run `pnpm vitest run scripts/nexus-api/test-install.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add -- scripts/nexus-api/seed-profile.ts scripts/nexus-api/seed-profile.test.ts scripts/nexus-api/install.sh scripts/nexus-api/test-install.test.ts
git commit -m "feat(dgs-481): add the encrypted profile seed step" -- scripts/nexus-api/seed-profile.ts scripts/nexus-api/seed-profile.test.ts scripts/nexus-api/install.sh scripts/nexus-api/test-install.test.ts
```

---

### Task 7: The life-calendar route and the no-secret-in-logs test

**Files:**
- Create: `scripts/nexus-api/src/life-calendar-route.ts`, `scripts/nexus-api/src/life-calendar-route.test.ts`, `scripts/nexus-api/src/no-secret-in-logs.test.ts`
- Modify: `scripts/nexus-api/src/app.ts`, `scripts/nexus-api/src/server.ts`

**Interfaces:**
- Consumes: `computeCalendar`, `todayUtc7`, `readAtUtc7` (task 3); `lifeCalendarSchema` (task 3); `open`, `Profile` (task 4); `KeyProvider` (task 4); `openStore`, `StoreError` (task 5); `sendJson`, `Env` (tasks 1, 2).
- Produces: `buildApp(getReading, deps?: { logger?: Logger; loadProfile?: () => Promise<Profile>; now?: () => number })`; `createProfileLoader({ dataDir, getKey }): ProfileLoader` (a function returning the `Profile`, with `close()` for tests); `LIFE_PATH = '/api/v1/life-calendar'`; `AppType` that includes the life-calendar route (the page's typed client reads it); `createApiServer(getReading, deps?)`.

- [ ] **Step 1: Write the failing route tests**

`scripts/nexus-api/src/life-calendar-route.test.ts`:

```ts
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { apiErrorSchema, lifeCalendarSchema } from '../../nexus-shared/life-calendar.ts'
import { createApiServer, HOST } from './server.ts'
import type { Profile } from './profile-crypto.ts'

const FAKE: Profile = { birthDate: '1990-01-01', lifeYears: 90 }   // fake profile
const NOW = Date.parse('2026-10-16T14:00:00Z')                       // 21:00 on 2026-10-16 in UTC+7
const PATH = '/api/v1/life-calendar'

let server: ReturnType<typeof createApiServer> | undefined
afterEach(async () => { if (server) await new Promise(r => server!.close(r)); server = undefined })
async function start(loadProfile?: () => Promise<Profile>) {
  server = createApiServer(async () => null, { loadProfile, now: () => NOW })
  await new Promise<void>(r => server!.listen(0, HOST, r))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

describe('GET /api/v1/life-calendar', () => {
  it('200: the shared schema accepts the body, and the numbers are the mock numbers', async () => {
    const base = await start(async () => FAKE)
    const r = await fetch(base + PATH)
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(r.headers.get('cache-control')).toBe('no-store')
    const body = lifeCalendarSchema.parse(await r.json())
    expect(body.totals).toEqual({ weeksTotal: 4680, weeksLived: 1913, weeksLeft: 2766, percentLived: 40.9 })
    expect(body.current).toEqual({ row: 36, box: 41 })
    expect(body.today).toBe('2026-10-16')
    expect(body.readAtUtc7).toBe('2026-10-16 21:00:00')
  })
  it('the body has no key whose name suggests a birth date', async () => {
    const base = await start(async () => FAKE)
    const text = await (await fetch(base + PATH)).text()
    expect(Object.keys(JSON.parse(text))).toEqual(['readAt', 'readAtUtc7', 'today', 'timezone', 'totals', 'current', 'rows'])
    expect(text).not.toMatch(/birth|born|dob|lifeYears/i)
  })
  it.each([
    ['profile_missing', { code: 'profile_missing' }],
    ['profile_invalid', { code: 'profile_invalid' }],
    ['key_unavailable', { code: 'key_unavailable' }],
    ['internal_invalid', new Error('1990-01-01 should never be shown')],
  ])('503 %s, with Retry-After and a body that holds only the code', async (code, thrown) => {
    const base = await start(async () => { throw thrown })
    const r = await fetch(base + PATH)
    expect(r.status).toBe(503)
    expect(r.headers.get('retry-after')).toBe('5')
    const text = await r.text()
    expect(apiErrorSchema.parse(JSON.parse(text))).toEqual({ error: code })
    expect(text).not.toContain('1990')
  })
  it('503 profile_missing when the server has no profile loader at all', async () => {
    const base = await start(undefined)
    expect((await (await fetch(base + PATH)).json()).error).toBe('profile_missing')
  })
  it('503 internal_invalid when the result fails the shared schema (zero rows)', async () => {
    const base = await start(async () => ({ birthDate: '1990-01-01', lifeYears: 0 }))
    const r = await fetch(base + PATH)
    expect(r.status).toBe(503)
    expect((await r.json()).error).toBe('internal_invalid')
  })
  it('400 bad_request for any query string, and the body does not echo it', async () => {
    const base = await start(async () => FAKE)
    const r = await fetch(base + PATH + '?birth=2000-01-01')
    expect(r.status).toBe(400)
    const text = await r.text()
    expect(JSON.parse(text)).toEqual({ error: 'bad_request' })
    expect(text).not.toContain('2000')
  })
  it('405 for other methods (HEAD too) and 404 for a trailing slash', async () => {
    const base = await start(async () => FAKE)
    for (const method of ['POST', 'PUT', 'DELETE', 'HEAD']) {
      const r = await fetch(base + PATH, { method })
      expect(r.status, method).toBe(405)
      expect(r.headers.get('allow')).toBe('GET')
    }
    expect((await fetch(base + PATH + '/')).status).toBe(404)
  })
})
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm vitest run scripts/nexus-api/src/life-calendar-route.test.ts`
Expected: FAIL (every request answers 404).

- [ ] **Step 3: Write `life-calendar-route.ts`**

```ts
import { z } from 'zod'
import { parseDay } from '../../nexus-shared/days.ts'
import { open, type Profile } from './profile-crypto.ts'
import { openStore, StoreError, type ProfileStore } from './profile-store.ts'

// The loader: opens the database on the first request (never creates it), reads the key once, decrypts per request.
// The decrypted profile is never kept. Errors carry codes only.
export type ProfileLoader = (() => Promise<Profile>) & { close(): Promise<void> }

export function createProfileLoader(opts: { dataDir: string; getKey: () => Promise<Buffer> }): ProfileLoader {
  let storeP: Promise<ProfileStore> | undefined
  let keyP: Promise<Buffer> | undefined
  const load = async (): Promise<Profile> => {
    storeP ??= openStore(opts.dataDir, { create: false })
    let store: ProfileStore
    try { store = await storeP } catch (e) { storeP = undefined; throw e }   // a missing database may appear later (after the seed step)
    keyP ??= opts.getKey()
    let key: Buffer
    try { key = await keyP } catch (e) { keyP = undefined; throw e }
    const sealed = await store.load()
    if (!sealed) throw new StoreError('profile_missing')
    let profile: Profile
    try { profile = open(sealed, key) } catch { throw new StoreError('profile_invalid') }
    try { parseDay(profile.birthDate) } catch { throw new StoreError('profile_invalid') }
    if (!Number.isInteger(profile.lifeYears) || profile.lifeYears < 1 || profile.lifeYears > 120) throw new StoreError('profile_invalid')
    return profile
  }
  // Only tests close it (PGlite lets one instance own a folder). The server keeps it open until the process ends.
  return Object.assign(load, { close: async () => { const s = await storeP?.catch(() => undefined); await s?.close(); storeP = undefined; keyP = undefined } })
}

export const emptyQuery = z.strictObject({})

export function errorCodeOf(e: unknown): 'profile_missing' | 'profile_invalid' | 'key_unavailable' | 'internal_invalid' {
  const code = (e as { code?: unknown } | null)?.code
  return code === 'profile_missing' || code === 'profile_invalid' || code === 'key_unavailable' ? code : 'internal_invalid'
}
```

- [ ] **Step 4: Add the route to `app.ts`**

Add imports and the route; the route is registered with `app.get(...)` and its result is returned, so `AppType` carries the typed route for the page:

```ts
import { zValidator } from '@hono/zod-validator'
import { lifeCalendarSchema } from '../../nexus-shared/life-calendar.ts'
import { computeCalendar, readAtUtc7, todayUtc7 } from './life-calendar.ts'
import { emptyQuery, errorCodeOf } from './life-calendar-route.ts'
import type { Profile } from './profile-crypto.ts'

export const LIFE_PATH = `/api/${API_VERSION}/life-calendar` as const

export interface AppDeps { logger?: Logger; loadProfile?: () => Promise<Profile>; now?: () => number }

export function buildApp(getReading: () => Promise<PowerMetrics | null>, deps: AppDeps = {}) {
  const logger = deps.logger ?? createLogger(() => {})
  const now = deps.now ?? Date.now
  const app = new Hono<Env>()
  // ... the logging middleware, the power route, notFound and onError exactly as in task 2 ...

  // Other methods on the life route: 405, as on the power route (HEAD is handled inside the GET handler below).
  app.on(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], LIFE_PATH, c => sendJson(c, 405, { error: 'method_not_allowed' }, { Allow: 'GET' }))

  return app.get(
    LIFE_PATH,
    zValidator('query', emptyQuery, (result, c) => {
      if (!result.success) return sendJson(c, 400, { error: 'bad_request' })   // never echoes the input
    }),
    async c => {
      // Hono runs a HEAD request through the GET route; c.req.method still says HEAD, so HEAD gets 405 here.
      if (c.req.method !== 'GET') return sendJson(c, 405, { error: 'method_not_allowed' }, { Allow: 'GET' })
      try {
        if (!deps.loadProfile) return sendJson(c, 503, { error: 'profile_missing' }, { 'Retry-After': '5' })
        const profile = await deps.loadProfile()
        const nowMs = now()
        const today = todayUtc7(nowMs)
        const calendar = computeCalendar({ birthDate: profile.birthDate, lifeYears: profile.lifeYears, today })
        const body = lifeCalendarSchema.parse({ readAt: new Date(nowMs).toISOString(), readAtUtc7: readAtUtc7(nowMs), today, timezone: 'UTC+7', totals: calendar.totals, current: calendar.current, rows: calendar.rows })
        c.header('Cache-Control', 'no-store')
        return c.json(body, 200, { 'Content-Type': 'application/json; charset=utf-8' })
      } catch (e) {
        return sendJson(c, 503, { error: errorCodeOf(e) }, { 'Retry-After': '5' })
      }
    },
  )
}
export type AppType = ReturnType<typeof buildApp>
```

Note on the order: `app.on(...)` for the other methods is registered before `app.get`; the GET route is the last expression so TypeScript keeps its type. If `c.json` drops the explicit `Content-Type` charset in Hono 4.13.13, the first route test fails on the header; then set it by building the response with `c.body(JSON.stringify(body), 200, {...})` and keep the typed client by exporting a type-only helper `type LifeCalendarResponse = LifeCalendar` for the page, and tell the Maestro (the end-to-end type test in task 10 then uses that helper).

Update `createApiServer` in `server.ts` to take `deps: AppDeps = {}` and pass it on. In the entry block wire the real loader:

```ts
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createProfileLoader } from './life-calendar-route.ts'
import { selectKeyProvider } from './key-provider.ts'
// ...
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = parsePort(process.env.PORT)
  const logger = createLogger()
  const depot = process.env.DIGISMITH_DEPOT ?? join(homedir(), '.digismith-depot')
  const loadProfile = createProfileLoader({
    dataDir: join(depot, 'nexus', 'db'),
    // lazy, so a missing key makes the calendar route answer 503 key_unavailable and never stops the server from starting
    getKey: () => Promise.resolve().then(() => selectKeyProvider(process.env.NEXUS_KEY_PROVIDER, { keyFile: join(depot, 'nexus', 'profile.key') }).getKey()),
  })
  createApiServer(createDefaultReader(), { logger, loadProfile }).listen(port, HOST, () => logger.info('listening', { host: HOST, port }))
}
```

- [ ] **Step 5: Run the route tests and the whole API suite**

Run: `pnpm vitest run scripts/nexus-api`
Expected: PASS.

- [ ] **Step 6: Write the no-secret-in-logs test and run it**

`scripts/nexus-api/src/no-secret-in-logs.test.ts` seeds a real fake profile into a temp depot, then drives every error path through the real loader, and checks the collected log lines.

```ts
import { randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { seed } from '../seed-profile.ts'
import { fileKeyProvider } from './key-provider.ts'
import { createProfileLoader } from './life-calendar-route.ts'
import { createLogger } from './logger.ts'
import { openStore } from './profile-store.ts'
import { createApiServer, HOST } from './server.ts'

const FAKE = { birthDate: '1990-01-01', lifeYears: 90 }   // fake profile
const T = 120_000

describe('no profile value, key, ciphertext or nonce reaches a log line', () => {
  it('holds for a good request and for every error path', async () => {
    // a real fake depot: input -> seed -> key file + encrypted database
    const d = mkdtempSync(join(tmpdir(), 'nexus-logs-'))
    mkdirSync(join(d, 'nexus'), { recursive: true })
    const input = join(d, 'nexus', 'profile.private.json')
    writeFileSync(input, JSON.stringify(FAKE), { mode: 0o600 }); chmodSync(input, 0o600)
    const dataDir = join(d, 'nexus', 'db'), keyFile = join(d, 'nexus', 'profile.key')
    await seed({ inputPath: input, dataDir, keyFile })
    const key = await fileKeyProvider(keyFile).getKey()

    const store = await openStore(dataDir, { create: false })
    const sealed = (await store.load())!
    await store.close()

    const lines: string[] = []
    const logger = createLogger(l => lines.push(l), () => 0)
    const NOW = Date.parse('2026-10-16T14:00:00Z')
    const secrets: string[] = []
    const addVariants = (b: Buffer) => secrets.push(b.toString('hex'), b.toString('base64'), b.toString('base64url'))
    addVariants(key); addVariants(sealed.nonce); addVariants(sealed.ciphertext)
    secrets.push('1990-01-01', '19900101', '01/01/1990', '1 January 1990', 'January 1, 1990', '"lifeYears"', 'sk-FAKE-token-value')

    // one server per call; a loader is closed after its call so two loaders never own the same data folder
    async function hit(loadProfile: (() => Promise<any>) & { close?: () => Promise<void> }, path = '/api/v1/life-calendar', init: RequestInit = {}) {
      const server = createApiServer(async () => null, { logger, loadProfile, now: () => NOW })
      await new Promise<void>(r => server.listen(0, HOST, r))
      try { await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`, init) } finally { await new Promise(r => server.close(r)); await loadProfile.close?.() }
    }

    // 1. a good request through the real loader
    await hit(createProfileLoader({ dataDir, getKey: () => fileKeyProvider(keyFile).getKey() }))
    // 2. a query string and an Authorization header
    await hit(createProfileLoader({ dataDir, getKey: () => fileKeyProvider(keyFile).getKey() }), '/api/v1/life-calendar?birth=1990-01-01', { headers: { Authorization: 'Bearer sk-FAKE-token-value' } })
    // 3. a missing profile
    await hit(createProfileLoader({ dataDir: join(d, 'nexus', 'nope'), getKey: () => fileKeyProvider(keyFile).getKey() }))
    // 4. a missing key
    await hit(createProfileLoader({ dataDir, getKey: () => fileKeyProvider(join(d, 'nexus', 'no.key')).getKey() }))
    // 5. a wrong key
    await hit(createProfileLoader({ dataDir, getKey: async () => randomBytes(32) }))
    // 6. a provider that throws an error whose message holds the fake values
    await hit(async () => { throw new Error(`boom ${FAKE.birthDate} ${key.toString('hex')} sk-FAKE-token-value`) })
    // 7. a changed blob (a second database folder with a tampered ciphertext)
    const bad = join(d, 'nexus', 'db-bad')
    const s2 = await openStore(bad, { create: true })
    const tampered = Buffer.from(sealed.ciphertext); tampered[0] ^= 1
    await s2.save({ nonce: sealed.nonce, ciphertext: tampered }, 1); await s2.close()
    await hit(createProfileLoader({ dataDir: bad, getKey: () => fileKeyProvider(keyFile).getKey() }))
    // 8. a response that fails the shared schema
    await hit(async () => ({ birthDate: FAKE.birthDate, lifeYears: 0 }))

    expect(lines.length).toBeGreaterThanOrEqual(8)
    const text = lines.join('\n')
    for (const s of secrets) expect(text.includes(s), `a log line contains ${s.slice(0, 6)}...`).toBe(false)
    rmSync(d, { recursive: true, force: true })
  }, T)
})
```

Run: `pnpm vitest run scripts/nexus-api/src/no-secret-in-logs.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -- scripts/nexus-api/src/life-calendar-route.ts scripts/nexus-api/src/life-calendar-route.test.ts scripts/nexus-api/src/no-secret-in-logs.test.ts scripts/nexus-api/src/app.ts scripts/nexus-api/src/server.ts
git commit -m "feat(dgs-481): add the life-calendar route" -- scripts/nexus-api/src/life-calendar-route.ts scripts/nexus-api/src/life-calendar-route.test.ts scripts/nexus-api/src/no-secret-in-logs.test.ts scripts/nexus-api/src/app.ts scripts/nexus-api/src/server.ts
```

---

### Task 8: Caddy serves the page, Storybook and caching

**Files:**
- Modify: `scripts/caddy/Caddyfile`, `scripts/caddy/caddy-run.sh`, `scripts/caddy/test-config.mjs`

`Caddyfile.staging` has no `pazurite.com` route block of its own (it answers `staging`), so it stays unchanged.

- [ ] **Step 1: Write the failing checks in `test-config.mjs`**

(a) In the section that builds the test Caddyfile and runs the throwaway Caddy, create a stub web root and pass it in the environment. Right after `const tcf = join(tmp, 'Caddyfile'); writeFileSync(tcf, src)` add:

```js
  const www = join(tmp, 'www'); mkdirSync(join(www, '_nuxt'), { recursive: true }); mkdirSync(join(www, 'storybook/assets'), { recursive: true })
  const big = '<!doctype html><title>x</title>' + '<p>padding</p>'.repeat(120)   // over Caddy's compression minimum
  writeFileSync(join(www, 'index.html'), big); writeFileSync(join(www, '_nuxt/app.abc123.js'), 'console.log(1)\n'.repeat(80))
  writeFileSync(join(www, 'storybook/index.html'), big); writeFileSync(join(www, 'storybook/assets/x-abc123.js'), 'console.log(2)\n'.repeat(80))
```

and in the `spawn(CADDY, ...)` call change the `env` to `{ ...DUMMY, DIGISMITH_WWW: www, XDG_DATA_HOME: join(tmp, 'data'), XDG_CONFIG_HOME: join(tmp, 'cfg') }`.

(b) Change the `get` helper to send an optional `accept-encoding` and return the headers as a third element:

```js
  const get = (host, path, auth, extra = {}) => new Promise(ok => https.get({ host: '127.0.0.1', port: FRONT, path, servername: host, rejectUnauthorized: false, headers: { host, ...extra, ...(auth ? { authorization: 'Basic ' + Buffer.from(auth).toString('base64') } : {}) } }, res => { let b = ''; res.on('data', d => { b += d }); res.on('end', () => ok([res.statusCode, b, res.headers])) }).on('error', e => ok([0, e.message])))
```

(c) Replace the line `{ const [c, b] = await get('pazurite.com', '/'); check('pazurite.com/ -> 404 (no login needed)', ...) }` with:

```js
  { const [c, b, h] = await get('pazurite.com', '/'); check('pazurite.com/ serves the page', c === 200 && b.includes('<title>x</title>'), `got ${c}`); check('index.html is sent no-cache', h?.['cache-control'] === 'no-cache', JSON.stringify(h?.['cache-control'])) }
  { const [c, , h] = await get('pazurite.com', '/_nuxt/app.abc123.js'); check('hashed page asset is immutable for a year', c === 200 && h['cache-control'] === 'public, max-age=31536000, immutable', JSON.stringify(h?.['cache-control'])) }
  { const [c, b, h] = await get('pazurite.com', '/storybook/'); check('/storybook/ serves Storybook, no-cache', c === 200 && b.includes('<title>x</title>') && h['cache-control'] === 'no-cache', `got ${c}`) }
  { const [c, , h] = await get('pazurite.com', '/storybook'); check('/storybook redirects to /storybook/', c >= 300 && c < 400 && String(h.location).endsWith('/storybook/'), `got ${c} ${h?.location}`) }
  { const [c, , h] = await get('pazurite.com', '/storybook/assets/x-abc123.js'); check('Storybook hashed asset is immutable', c === 200 && h['cache-control'] === 'public, max-age=31536000, immutable', JSON.stringify(h?.['cache-control'])) }
  { const [c, , h] = await get('pazurite.com', '/', undefined, { 'accept-encoding': 'gzip' }); check('the page is compressed', c === 200 && /gzip|zstd/.test(String(h['content-encoding'])), JSON.stringify(h?.['content-encoding'])) }
  { const [c] = await get('pazurite.com', '/missing.html'); check('an unknown file is 404', c === 404, `got ${c}`) }
```

(d) In the checks on the apex route, replace `check('apex proxies only /api/* to 127.0.0.1:4300', ...)` with a version that still requires exactly one `reverse_proxy` to `127.0.0.1:4300` for `/api/*` and also requires a `file_server`: add `&& apexJson.includes('file_server')`.

(e) In the `caddy-run.sh` stub section, extend the stub binary's grep list with `DIGISMITH_WWW` and add: `check('caddy-run.sh gives Caddy the web root', /DIGISMITH_WWW set/.test(r.stdout), r.stdout)`.

- [ ] **Step 2: Run to see the checks fail**

Run: `CADDY_BIN=~/.digismith-depot/bin/caddy node scripts/caddy/test-config.mjs`
Expected: several `FAIL` lines (the page still answers 404, no `file_server`, no web root variable). The throwaway Caddy listens only on high ports on 127.0.0.1 and never touches the depot.

- [ ] **Step 3: Change `Caddyfile` and `caddy-run.sh`**

In `scripts/caddy/Caddyfile`, replace the `pazurite.com` block with:

```
pazurite.com {
	tls {
		dns cloudflare {env.CLOUDFLARE_API_TOKEN}
	}
	encode zstd gzip
	# Nexus API (DGS-324): the whole /api/* space goes to the API, which names the version. No login for now (tailnet only, read-only; login design: DGS-458).
	handle /api/* {
		reverse_proxy 127.0.0.1:4300 {
			header_up -Authorization
		}
	}
	# The life dashboard (DGS-481): static files from the depot. /storybook/ is the Storybook build next to the page. No CDN for now.
	handle {
		root * {env.DIGISMITH_WWW}
		@hashed path /_nuxt/* /storybook/assets/*
		@notHashed not path /_nuxt/* /storybook/assets/*
		header @hashed Cache-Control "public, max-age=31536000, immutable"
		header @notHashed Cache-Control "no-cache"
		file_server
	}
}
```

In `scripts/caddy/caddy-run.sh`, add this line right after `export CLOUDFLARE_API_TOKEN`:

```sh
export DIGISMITH_WWW="$D/nexus/www"   # DGS-481: the static page and Storybook; the install step creates it
```

- [ ] **Step 4: Run the checks again**

Run: `CADDY_BIN=~/.digismith-depot/bin/caddy node scripts/caddy/test-config.mjs`
Expected: all `PASS`, exit 0. Also run `~/.digismith-depot/bin/caddy validate --config scripts/caddy/Caddyfile --adapter caddyfile` with `CLOUDFLARE_API_TOKEN=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa DIGISMITH_WWW=/tmp` in the environment; expect `Valid configuration`. Do not restart the running Caddy; the Maestro does that at deploy.

- [ ] **Step 5: Commit**

```bash
git add -- scripts/caddy/Caddyfile scripts/caddy/caddy-run.sh scripts/caddy/test-config.mjs
git commit -m "feat(dgs-481): serve the page and Storybook from Caddy" -- scripts/caddy/Caddyfile scripts/caddy/caddy-run.sh scripts/caddy/test-config.mjs
```

---
### Task 9: The Nuxt app: scaffold, tokens, shell

**Files:**
- Create: `scripts/nexus-web/package.json`, `scripts/nexus-web/nuxt.config.ts`, `scripts/nexus-web/tsconfig.json`, `scripts/nexus-web/vitest.config.ts`, `scripts/nexus-web/app/app.vue`, `scripts/nexus-web/app/assets/main.scss`, `scripts/nexus-web/app/components/DashboardHeader.vue`, `scripts/nexus-web/app/components/WidgetFrame.vue`, `scripts/nexus-web/app/utils/format.ts`, `scripts/nexus-web/app/utils/format.test.ts`, `scripts/nexus-web/app/components/shell.test.ts`
- Modify: `pnpm-workspace.yaml`, `vitest.config.ts`, `.gitignore`

**Interfaces:**
- Produces: `formatHeaderDate(nowMs: number): string` ("Friday 16 October 2026", UTC+7); `msUntilNextMidnightUtc7(nowMs: number): number`; `<DashboardHeader />`; `<WidgetFrame title meta>` with default and `note` slots; the aliases `#api-type`, `#life-schema`, `#days`; the SCSS tokens (CSS variables `--bg --ink --ink-2 --line --ahead --accent --accent-text`).

- [ ] **Step 1: Create the package and install**

`scripts/nexus-web/package.json` (pin `typescript` to the version the root lockfile already resolves: run `pnpm why typescript` from the root and copy it):

```json
{
  "name": "@digismith/nexus-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "nuxt dev",
    "generate": "nuxt generate",
    "typecheck": "nuxt typecheck",
    "test": "vitest run",
    "postinstall": "nuxt prepare"
  },
  "dependencies": {
    "hono": "4.13.13",
    "nuxt": "4.6.1",
    "vue": "3.5.44",
    "zod": "4.6.7"
  },
  "devDependencies": {
    "@nuxt/test-utils": "4.3.3",
    "@vue/test-utils": "2.5.1",
    "happy-dom": "21.0.3",
    "sass": "1.105.2",
    "typescript": "<the version from pnpm why typescript>",
    "vitest": "5.0.5",
    "vue-tsc": "3.3.13"
  }
}
```

In `pnpm-workspace.yaml` add `  - "scripts/nexus-web"`. In the root `vitest.config.ts` add `'**/scripts/nexus-web/**'` to `test.exclude` (the page package has its own Vitest 5; the root keeps Vitest 2). Add these lines to the root `.gitignore`:

```
scripts/nexus-web/.nuxt/
scripts/nexus-web/.output/
scripts/nexus-web/storybook-static/
scripts/nexus-web/test-results/
scripts/nexus-web/playwright-report/
scripts/nexus-web/.lighthouseci/
```

Run: `pnpm install` from the worktree root. Expected: Nuxt installs and `nuxt prepare` runs for the page package. Confirm the Vite major: `pnpm --filter @digismith/nexus-web why vite`; expected 8.x. If Nuxt resolves a different major, keep it and tell the Maestro.

- [ ] **Step 2: Config files**

`scripts/nexus-web/nuxt.config.ts`:

```ts
import { fileURLToPath } from 'node:url'

// Static generation (spec section 11): nuxt generate writes prerendered HTML and JS; Caddy serves the files. No Nitro server, no router.
export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  ssr: true,
  devtools: { enabled: false },
  telemetry: false,
  css: ['~/assets/main.scss'],
  alias: {
    // type-only import of the API app (never bundled), the shared schema and the shared day helpers
    '#api-type': fileURLToPath(new URL('../nexus-api/src/app.ts', import.meta.url)),
    '#life-schema': fileURLToPath(new URL('../nexus-shared/life-calendar.ts', import.meta.url)),
    '#days': fileURLToPath(new URL('../nexus-shared/days.ts', import.meta.url)),
  },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'pazurite',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'color-scheme', content: 'light dark' },
        { name: 'robots', content: 'noindex' },
      ],
    },
  },
  experimental: { payloadExtraction: false },   // no payload files: the page requests nothing at load except the API
  typescript: { strict: true },
})
```

`scripts/nexus-web/vitest.config.ts`:

```ts
import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    environmentOptions: { nuxt: { domEnvironment: 'happy-dom' } },
    include: ['app/**/*.test.ts', 'tests/unit/**/*.test.ts'],
  },
})
```

`scripts/nexus-web/tsconfig.json`: `{ "extends": "./.nuxt/tsconfig.json" }`.

- [ ] **Step 3: Write the failing tests**

`scripts/nexus-web/app/utils/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatHeaderDate, msUntilNextMidnightUtc7 } from './format'

describe('format', () => {
  it('header date is the UTC+7 day in fixed English', () => {
    expect(formatHeaderDate(Date.parse('2026-10-16T14:00:00Z'))).toBe('Friday 16 October 2026')
    expect(formatHeaderDate(Date.parse('2026-10-16T17:00:00Z'))).toBe('Saturday 17 October 2026')   // 00:00 on 17 October in UTC+7
  })
  it('ms until the next UTC+7 midnight', () => {
    expect(msUntilNextMidnightUtc7(Date.parse('2026-10-16T16:59:00Z'))).toBe(60_000)
    expect(msUntilNextMidnightUtc7(Date.parse('2026-10-16T17:00:00Z'))).toBe(86_400_000)
  })
})
```

`scripts/nexus-web/app/components/shell.test.ts`:

```ts
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import DashboardHeader from './DashboardHeader.vue'
import WidgetFrame from './WidgetFrame.vue'

describe('shell components', () => {
  it('the header has the wordmark and a date slot of fixed size', async () => {
    const w = await mountSuspended(DashboardHeader)
    expect(w.find('header').exists()).toBe(true)
    expect(w.text()).toContain('pazurite')
    expect(w.find('.date').exists()).toBe(true)
  })
  it('the widget frame renders an h2, the meta, the content and the note', async () => {
    const w = await mountSuspended(WidgetFrame, { props: { title: 'Life Calendar', meta: 'Updated 21:00, UTC+7' }, slots: { default: '<p id="c">content</p>', note: 'a note' } })
    expect(w.find('section').attributes('aria-labelledby')).toBeTruthy()
    expect(w.find('h2').text()).toBe('Life Calendar')
    expect(w.text()).toContain('Updated 21:00, UTC+7')
    expect(w.find('#c').exists()).toBe(true)
    expect(w.text()).toContain('a note')
  })
})
```

- [ ] **Step 4: Run to see them fail**

Run: `pnpm --filter @digismith/nexus-web test`
Expected: FAIL (files missing).

- [ ] **Step 5: Write the utils, the components, the shell and the styles**

`scripts/nexus-web/app/utils/format.ts`:

```ts
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const UTC7_MS = 7 * 3_600_000
const DAY_MS = 86_400_000

// "Friday 16 October 2026": the UTC+7 calendar day, fixed English, no locale.
export function formatHeaderDate(nowMs: number): string {
  const d = new Date(nowMs + UTC7_MS)
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export function msUntilNextMidnightUtc7(nowMs: number): number {
  const local = nowMs + UTC7_MS
  return DAY_MS - (((local % DAY_MS) + DAY_MS) % DAY_MS)
}
```

`scripts/nexus-web/app/components/DashboardHeader.vue`:

```vue
<script setup lang="ts">
// The date depends on "now", so it is drawn on the client only, in a slot of fixed size: the prerendered HTML is never stale and never shifts.
const date = ref('')
onMounted(() => { date.value = formatHeaderDate(Date.now()) })
</script>

<template>
  <header class="top">
    <span class="wordmark">pazurite</span>
    <span class="date" aria-label="Today">{{ date || ' ' }}</span>
  </header>
</template>

<style scoped lang="scss">
.top { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; max-width: 1000px; margin: 0 auto; padding: 16px 16px 12px; border-bottom: 1px solid var(--line); box-sizing: border-box; }
@media (min-width: 640px) { .top { padding-inline: 32px; } }
.wordmark { font-weight: 650; letter-spacing: -0.01em; }
.date { min-width: 22ch; text-align: right; color: var(--ink-2); font-size: 13px; font-variant-numeric: tabular-nums; white-space: nowrap; }
</style>
```

`scripts/nexus-web/app/components/WidgetFrame.vue`:

```vue
<script setup lang="ts">
defineProps<{ title: string; meta?: string }>()
const id = useId()
</script>

<template>
  <section class="widget" :aria-labelledby="id">
    <div class="title-row">
      <h2 :id="id">{{ title }}</h2>
      <span class="meta">{{ meta }}</span>
    </div>
    <slot />
    <p v-if="$slots.note" class="note"><slot name="note" /></p>
  </section>
</template>

<style scoped lang="scss">
.widget { max-width: 920px; margin: 0 auto; }
.title-row { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 4px 16px; margin-bottom: 16px; min-height: 28px; }
h2 { margin: 0; font-size: 20px; font-weight: 650; }
.meta { color: var(--ink-2); font-size: 13px; min-height: 1.4em; }
.note { margin: 16px 0 0; color: var(--ink-2); font-size: 13px; }
</style>
```

`scripts/nexus-web/app/app.vue`:

```vue
<template>
  <a class="skip" href="#calendar">Skip to the calendar</a>
  <DashboardHeader />
  <main id="main" class="dashboard">
    <h1 class="sr-only">Dashboard</h1>
    <LifeCalendar />
  </main>
</template>
```

(`LifeCalendar` is added in task 10. Until then create `app/components/LifeCalendar.vue` with `<template><WidgetFrame title="Life Calendar" /></template>` so the app builds; task 10 replaces it.)

`scripts/nexus-web/app/assets/main.scss` (the Designer's tokens from `ui-design.md` section 2, copied verbatim):

```scss
:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --ink: #0a0a0a;
  --ink-2: #5c5c5c;
  --line: #e6e6e6;
  --ahead: #8f8f8f;
  --accent: #e8401c;        // pending Jack: vermilion is the Designer's recommendation
  --accent-text: #c8310f;
  --radius-box: 1px;
  --gap: 1px;
  --gutter: 16px;
}
@media (min-width: 640px) { :root { --radius-box: 2px; --gap: 2px; --gutter: 32px; } }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) { --bg: #0a0a0a; --ink: #f2f2f2; --ink-2: #a3a3a3; --line: #262626; --ahead: #6b6b6b; --accent: #ff5a3c; --accent-text: #ff6a4d; }
}
:root[data-theme='dark'] { --bg: #0a0a0a; --ink: #f2f2f2; --ink-2: #a3a3a3; --line: #262626; --ahead: #6b6b6b; --accent: #ff5a3c; --accent-text: #ff6a4d; }

*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 1.5;
  font-variant-numeric: tabular-nums;
}
::selection { background: color-mix(in srgb, var(--accent) 28%, transparent); }
.dashboard { padding: 24px var(--gutter) 64px; }
.sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.skip { position: absolute; left: 8px; top: -48px; z-index: 10; padding: 8px 12px; background: var(--ink); color: var(--bg); border-radius: 8px; }
.skip:focus { top: 8px; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
```

- [ ] **Step 6: Run the tests, the type check and a generate**

Run: `pnpm --filter @digismith/nexus-web test` → PASS.
Run: `pnpm --filter @digismith/nexus-web typecheck` → no errors.
Run: `pnpm --filter @digismith/nexus-web generate`, then `grep -c "<h1" scripts/nexus-web/.output/public/index.html` → `1`, and `ls scripts/nexus-web/.output/public/_nuxt | head` shows hashed files.

- [ ] **Step 7: Commit**

```bash
git add -- pnpm-workspace.yaml pnpm-lock.yaml vitest.config.ts .gitignore scripts/nexus-web
git commit -m "feat(dgs-481): scaffold the Nuxt app with the shell and tokens" -- pnpm-workspace.yaml pnpm-lock.yaml vitest.config.ts .gitignore scripts/nexus-web
```

---

### Task 10: Page data layer and the state panels

**Files:**
- Create: `scripts/nexus-web/app/types.ts`, `scripts/nexus-web/app/composables/useLifeCalendar.ts`, `scripts/nexus-web/app/composables/useLifeCalendar.test.ts`, `scripts/nexus-web/app/components/AppButton.vue`, `scripts/nexus-web/app/components/StatePanel.vue`, `scripts/nexus-web/app/components/LifeCalendarView.vue`, `scripts/nexus-web/app/components/LifeCalendarLoaded.vue`, `scripts/nexus-web/app/components/states.test.ts`
- Modify: `scripts/nexus-web/app/components/LifeCalendar.vue`

**Interfaces:**
- Consumes: `lifeCalendarSchema`, `apiErrorSchema`, `LifeCalendar` (`#life-schema`); `AppType` (`#api-type`); `WidgetFrame`, `formatHeaderDate`, `msUntilNextMidnightUtc7` (task 9).
- Produces: `type LifeState = { kind: 'loading' } | { kind: 'loaded'; data: LifeCalendar } | { kind: 'error' } | { kind: 'locked' } | { kind: 'empty' }` (in `app/types.ts`); `loadLifeCalendar(opts?: { base?: string; fetch?: typeof fetch }): Promise<LifeState>`; `<StatePanel kind retrying @retry>`; `<LifeCalendarView :state :retrying @retry>`; `<LifeCalendar />` (the container).

- [ ] **Step 1: Write the failing tests**

`scripts/nexus-web/app/composables/useLifeCalendar.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { fixture } from '../../tests/fixtures'
import { loadLifeCalendar } from './useLifeCalendar'

const json = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as typeof fetch
const BASE = 'http://localhost'

describe('loadLifeCalendar', () => {
  it('a good body becomes loaded', async () => {
    const data = fixture('2026-10-16')
    expect(await loadLifeCalendar({ base: BASE, fetch: json(200, data) })).toEqual({ kind: 'loaded', data })
  })
  it('a 200 with a wrong shape (an extra birth-date key) becomes error', async () => {
    expect((await loadLifeCalendar({ base: BASE, fetch: json(200, { ...fixture('2026-10-16'), birthDate: '2000-01-01' }) })).kind).toBe('error')
  })
  it('503 key_unavailable becomes locked, 503 profile_missing becomes empty', async () => {
    expect((await loadLifeCalendar({ base: BASE, fetch: json(503, { error: 'key_unavailable' }) })).kind).toBe('locked')
    expect((await loadLifeCalendar({ base: BASE, fetch: json(503, { error: 'profile_missing' }) })).kind).toBe('empty')
  })
  it('any other code, a non-JSON body and a network failure become error', async () => {
    expect((await loadLifeCalendar({ base: BASE, fetch: json(503, { error: 'profile_invalid' }) })).kind).toBe('error')
    expect((await loadLifeCalendar({ base: BASE, fetch: (async () => new Response('<html>', { status: 502 })) as typeof fetch })).kind).toBe('error')
    expect((await loadLifeCalendar({ base: BASE, fetch: (async () => { throw new TypeError('network') }) as typeof fetch })).kind).toBe('error')
  })
})
```

`scripts/nexus-web/tests/fixtures.ts` (fake data only; built by the API's own pure math so it cannot drift from the counting rule; used by the unit tests and, in task 14, by the stories):

```ts
import { computeCalendar, readAtUtc7 } from '../../nexus-api/src/life-calendar'
import type { LifeCalendar } from '../../nexus-shared/life-calendar'

export const FAKE_PROFILE = { birthDate: '1990-01-01', lifeYears: 90 }   // fake: the only profile any test or story uses

// A LifeCalendar for the fake profile on a given UTC+7 day (default: the Designer mock's day).
export function fixture(today = '2026-10-16', profile = FAKE_PROFILE): LifeCalendar {
  const c = computeCalendar({ ...profile, today })
  const nowMs = Date.parse(`${today}T14:00:00Z`)   // 21:00 in UTC+7 on that day
  return { readAt: new Date(nowMs).toISOString(), readAtUtc7: readAtUtc7(nowMs), today, timezone: 'UTC+7', totals: c.totals, current: c.current, rows: c.rows }
}
export const BEFORE_BIRTH = () => fixture('1989-12-31')
export const PAST_LAST_ROW = () => fixture('2080-01-01')
```

`scripts/nexus-web/app/components/states.test.ts`:

```ts
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { fixture } from '../../tests/fixtures'
import LifeCalendarView from './LifeCalendarView.vue'
import StatePanel from './StatePanel.vue'

describe('StatePanel', () => {
  it.each([
    ['error', 'alert', 'The calendar is not available right now.', 'Retry'],
    ['locked', 'alert', 'The calendar is locked.', 'Retry'],
    ['empty', 'status', 'No calendar yet.', 'Reload'],
  ] as const)('%s uses role %s, shows its words and a %s button', async (kind, role, title, button) => {
    const w = await mountSuspended(StatePanel, { props: { kind, retrying: false } })
    expect(w.find(`[role="${role}"]`).exists()).toBe(true)
    expect(w.text()).toContain(title)
    expect(w.find('button').text()).toBe(button)
  })
  it('never shows a code, a path or a key name', async () => {
    for (const kind of ['error', 'locked', 'empty'] as const) {
      const text = (await mountSuspended(StatePanel, { props: { kind, retrying: false } })).text()
      expect(text).not.toMatch(/key_unavailable|profile_|\/api\/|profile\.key|\.json/)
    }
  })
  it('the button says "Retrying…", is disabled while retrying, and emits retry on click', async () => {
    const w = await mountSuspended(StatePanel, { props: { kind: 'error', retrying: false } })
    await w.find('button').trigger('click')
    expect(w.emitted('retry')).toHaveLength(1)
    await w.setProps({ retrying: true })
    expect(w.find('button').text()).toBe('Retrying…')
    expect(w.find('button').attributes('disabled')).toBeDefined()
  })
})

describe('LifeCalendarView frame', () => {
  it('keeps the title in every state and shows the matching meta', async () => {
    const cases = [
      [{ kind: 'loading' }, 'Loading your calendar…'],
      [{ kind: 'loaded', data: fixture() }, 'Updated 21:00, UTC+7'],
      [{ kind: 'error' }, 'Not available'],
    ] as const
    for (const [state, meta] of cases) {
      const w = await mountSuspended(LifeCalendarView, { props: { state, retrying: false } })
      expect(w.find('h2').text()).toBe('Life Calendar')
      expect(w.text()).toContain(meta)
    }
  })
  it('shows a panel for error, locked and empty, and none while loading or loaded', async () => {
    for (const kind of ['error', 'locked', 'empty'] as const) {
      expect((await mountSuspended(LifeCalendarView, { props: { state: { kind }, retrying: false } })).find('.panel').exists()).toBe(true)
    }
    expect((await mountSuspended(LifeCalendarView, { props: { state: { kind: 'loading' }, retrying: false } })).find('.panel').exists()).toBe(false)
    expect((await mountSuspended(LifeCalendarView, { props: { state: { kind: 'loaded', data: fixture() }, retrying: false } })).find('.panel').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm --filter @digismith/nexus-web test`
Expected: FAIL (files missing).

- [ ] **Step 3: Write the types, the loader and the container**

`scripts/nexus-web/app/types.ts`:

```ts
import type { LifeCalendar } from '#life-schema'

export type LifeState =
  | { kind: 'loading' }
  | { kind: 'loaded'; data: LifeCalendar }
  | { kind: 'error' }
  | { kind: 'locked' }
  | { kind: 'empty' }
```

`scripts/nexus-web/app/composables/useLifeCalendar.ts`:

```ts
import { hc } from 'hono/client'
import { apiErrorSchema, lifeCalendarSchema } from '#life-schema'
import type { AppType } from '#api-type'
import type { LifeState } from '../types'

// Calls GET /api/v1/life-calendar through Hono's typed client, then runs the shared schema on the answer (the client gives types only).
// The 503 body carries a code only, so the page can map it to a panel without learning anything private.
export async function loadLifeCalendar(opts: { base?: string; fetch?: typeof fetch } = {}): Promise<LifeState> {
  try {
    const client = hc<AppType>(opts.base ?? location.origin, opts.fetch ? { fetch: opts.fetch } : {})
    const res = await client.api.v1['life-calendar'].$get()
    const body: unknown = await res.json().catch(() => null)
    if (res.ok) {
      const parsed = lifeCalendarSchema.safeParse(body)
      return parsed.success ? { kind: 'loaded', data: parsed.data } : { kind: 'error' }
    }
    const err = apiErrorSchema.safeParse(body)
    if (err.success && err.data.error === 'key_unavailable') return { kind: 'locked' }
    if (err.success && err.data.error === 'profile_missing') return { kind: 'empty' }
    return { kind: 'error' }
  } catch {
    return { kind: 'error' }
  }
}
```

`scripts/nexus-web/app/components/LifeCalendar.vue` (the container: fetches, retries, refreshes at the UTC+7 midnight, moves focus to the grid after a successful retry):

```vue
<script setup lang="ts">
import type { LifeState } from '../types'

const state = ref<LifeState>({ kind: 'loading' })
const retrying = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

async function load(isRetry = false) {
  retrying.value = isRetry
  const next = await loadLifeCalendar()
  const recovered = isRetry && next.kind === 'loaded'
  state.value = next
  retrying.value = false
  if (recovered) { await nextTick(); document.getElementById('calendar-grid')?.querySelector<HTMLElement>('[tabindex="0"]')?.focus() }
}
function scheduleMidnight() {
  timer = setTimeout(async () => { await load(); scheduleMidnight() }, msUntilNextMidnightUtc7(Date.now()) + 1000)
}
onMounted(() => { load(); scheduleMidnight() })
onBeforeUnmount(() => { if (timer) clearTimeout(timer) })
</script>

<template>
  <LifeCalendarView :state="state" :retrying="retrying" @retry="load(true)" />
</template>
```

- [ ] **Step 4: Write the button, the panel, the view and the loaded stub**

`scripts/nexus-web/app/components/AppButton.vue`:

```vue
<script setup lang="ts">
defineProps<{ busy?: boolean; busyLabel?: string }>()
defineEmits<{ click: [] }>()
</script>

<template>
  <button type="button" class="btn" :disabled="busy" @click="$emit('click')">
    <slot v-if="!busy" />
    <template v-else>{{ busyLabel ?? 'Working…' }}</template>
  </button>
</template>

<style scoped lang="scss">
.btn { min-height: 44px; padding: 0 20px; border: 0; border-radius: 8px; background: var(--ink); color: var(--bg); font: inherit; font-weight: 600; cursor: pointer; transition: opacity 120ms ease-out; }
.btn:hover { opacity: 0.88; }
.btn:disabled { opacity: 0.6; cursor: default; }
.btn:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; box-shadow: 0 0 0 2px var(--bg); }
</style>
```

`scripts/nexus-web/app/components/StatePanel.vue` (wording: the Designer's, with one change marked **pending Jack**: the locked text says "Check the key" instead of "Unlock the Keychain", because the first deploy uses the key file and the Keychain is a later task):

```vue
<script setup lang="ts">
const props = defineProps<{ kind: 'error' | 'locked' | 'empty'; retrying: boolean }>()
defineEmits<{ retry: [] }>()
const COPY = {
  error: { role: 'alert', title: 'The calendar is not available right now.', text: '', button: 'Retry', busy: 'Retrying…' },
  // pending Jack: the Designer wrote "Unlock the Keychain on the Workbox"; the file key is used first, so the wording stays neutral
  locked: { role: 'alert', title: 'The calendar is locked.', text: 'The server cannot read its encryption key. Check the key on the Workbox, then try again.', button: 'Retry', busy: 'Retrying…' },
  empty: { role: 'status', title: 'No calendar yet.', text: 'The server has no profile saved. Run the seed step on the Workbox, then reload.', button: 'Reload', busy: 'Reloading…' },
} as const
const copy = computed(() => COPY[props.kind])
</script>

<template>
  <div class="panel" :role="copy.role">
    <svg v-if="kind !== 'empty'" class="icon" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M10 5.5v5.5M10 13.6v.9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
    <p class="title">{{ copy.title }}</p>
    <p v-if="copy.text" class="text">{{ copy.text }}</p>
    <AppButton :busy="retrying" :busy-label="copy.busy" @click="$emit('retry')">{{ copy.button }}</AppButton>
  </div>
</template>

<style scoped lang="scss">
.panel { max-width: 360px; margin: 0 auto; padding: 24px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); text-align: center; display: grid; gap: 12px; justify-items: center; }
.icon { color: var(--ink-2); }
.title { margin: 0; font-weight: 650; }
.text { margin: 0; color: var(--ink-2); font-size: 15px; }
</style>
```

`scripts/nexus-web/app/components/LifeCalendarView.vue` (the presentational widget: stats, legend and grid come in task 11; this step renders the frame, the meta and the panel over a placeholder box that task 11 replaces):

```vue
<script setup lang="ts">
import type { LifeState } from '../types'

const props = defineProps<{ state: LifeState; retrying: boolean }>()
defineEmits<{ retry: [] }>()
const meta = computed(() => {
  const s = props.state
  if (s.kind === 'loading') return 'Loading your calendar…'
  if (s.kind === 'loaded') return `Updated ${s.data.readAtUtc7.slice(11, 16)}, UTC+7`
  return 'Not available'
})
</script>

<template>
  <WidgetFrame title="Life Calendar" :meta="meta">
    <div id="calendar" class="area">
      <LifeCalendarLoaded v-if="state.kind === 'loaded'" :data="state.data" />
      <div v-else class="placeholder" aria-hidden="true" />
      <StatePanel v-if="state.kind === 'error' || state.kind === 'locked' || state.kind === 'empty'" class="over" :kind="state.kind" :retrying="retrying" @retry="$emit('retry')" />
    </div>
  </WidgetFrame>
</template>

<style scoped lang="scss">
.area { position: relative; }
.placeholder { height: 240px; }
.over { position: absolute; left: 50%; top: 32px; transform: translateX(-50%); width: min(360px, 100%); }
</style>
```

`scripts/nexus-web/app/components/LifeCalendarLoaded.vue` (stub that task 11 fills):

```vue
<script setup lang="ts">
import type { LifeCalendar } from '#life-schema'
defineProps<{ data: LifeCalendar }>()
</script>

<template>
  <div class="loaded" />
</template>
```

- [ ] **Step 5: Run the tests, the type check and a generate**

Run: `pnpm --filter @digismith/nexus-web test` → PASS.
Run: `pnpm --filter @digismith/nexus-web typecheck` → no errors. This is the first check that `hc<AppType>` infers `client.api.v1['life-calendar'].$get`. If TypeScript cannot see the route, check that `AppType` in `app.ts` is the return type of `buildApp` after the `.get(...)` chain (task 7) and that `#api-type` resolves.
Run: `pnpm --filter @digismith/nexus-web generate` → succeeds, and `grep -c "life-calendar" scripts/nexus-web/.output/public/index.html` → `0` (the HTML holds no API data).

- [ ] **Step 6: Commit**

```bash
git add -- scripts/nexus-web
git commit -m "feat(dgs-481): add the page data layer and state panels" -- scripts/nexus-web
```

---

### Task 11: The calendar grid, stats and legend

**Files:**
- Create: `scripts/nexus-web/app/components/StatItem.vue`, `scripts/nexus-web/app/components/StatsBar.vue`, `scripts/nexus-web/app/components/CalendarLegend.vue`, `scripts/nexus-web/app/components/GridSkeleton.vue`, `scripts/nexus-web/app/components/CalendarGrid.vue`, `scripts/nexus-web/app/components/grid.test.ts`, `scripts/nexus-web/app/components/stats.test.ts`
- Modify: `scripts/nexus-web/app/components/LifeCalendarLoaded.vue`, `scripts/nexus-web/app/components/LifeCalendarView.vue`

**Interfaces:**
- Consumes: `LifeCalendar` (`#life-schema`); `boxRange`, `formatLong` (`#days`); `fixture`, `BEFORE_BIRTH`, `PAST_LAST_ROW` (task 10).
- Produces: `<StatsBar :totals | null :loading>`; `<CalendarLegend />`; `<GridSkeleton :rows :ghost />`; `<CalendarGrid :data />`. The grid root has `id="calendar-grid"`, `role="grid"`, boxes have `role="gridcell"`, `data-row`, `data-box`, `data-state` (`lived|current|ahead`) and an `aria-label` like "Age 36, week 42 of 52, 15 October 2026 to 21 October 2026, this week". One cell has `tabindex="0"` (this week, or row 0 box 0 when there is none), all others `-1`.

- [ ] **Step 1: Write the failing tests**

`scripts/nexus-web/app/components/grid.test.ts`:

```ts
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { BEFORE_BIRTH, fixture, PAST_LAST_ROW } from '../../tests/fixtures'
import CalendarGrid from './CalendarGrid.vue'

describe('CalendarGrid', () => {
  it('draws 90 rows of 52 boxes with the right states', async () => {
    const w = await mountSuspended(CalendarGrid, { props: { data: fixture() } })
    expect(w.findAll('[role="row"]')).toHaveLength(91)   // 90 years + the ruler row
    expect(w.findAll('[role="gridcell"]')).toHaveLength(4680)
    expect(w.findAll('[data-state="lived"]')).toHaveLength(1913)
    expect(w.findAll('[data-state="current"]')).toHaveLength(1)
    expect(w.findAll('[data-state="ahead"]')).toHaveLength(2766)
  })
  it('names every box, with the full date range', async () => {
    const w = await mountSuspended(CalendarGrid, { props: { data: fixture() } })
    expect(w.find('[data-row="36"][data-box="41"]').attributes('aria-label')).toBe('Age 36, week 42 of 52, 15 October 2026 to 21 October 2026, this week')
    expect(w.find('[data-row="0"][data-box="0"]').attributes('aria-label')).toBe('Age 0, week 1 of 52, 1 January 1990 to 7 January 1990, lived')
    expect(w.find('[data-row="36"][data-box="51"]').attributes('aria-label')).toBe('Age 36, week 52 of 52, 24 December 2026 to 31 December 2026, ahead')
    expect(w.findAll('[role="gridcell"]').every(c => !!c.attributes('aria-label'))).toBe(true)
  })
  it('is a grid with a name, row headers and column headers', async () => {
    const w = await mountSuspended(CalendarGrid, { props: { data: fixture() } })
    const grid = w.find('[role="grid"]')
    expect(grid.attributes('id')).toBe('calendar-grid')
    expect(grid.attributes('aria-label')).toMatch(/arrow keys/i)
    expect(w.findAll('[role="rowheader"]')).toHaveLength(90)
    expect(w.findAll('[role="columnheader"]').map(h => h.text())).toEqual(['Age', 'Week 1', 'Week 13', 'Week 26', 'Week 39', 'Week 52'])
  })
  it('shows a visible age only every 10 rows, and all rows keep a hidden name', async () => {
    const w = await mountSuspended(CalendarGrid, { props: { data: fixture() } })
    expect(w.findAll('.age.labelled').map(a => a.find('[aria-hidden="true"]').text())).toEqual(['0', '10', '20', '30', '40', '50', '60', '70', '80'])
    expect(w.findAll('[role="rowheader"]')[36].find('.sr-only').text()).toBe('Age 36')
  })
  it('ends a decade with extra space: 8 gaps between 90 rows', async () => {
    const w = await mountSuspended(CalendarGrid, { props: { data: fixture() } })
    expect(w.findAll('.row.decade-end')).toHaveLength(8)
  })
  it('exactly one tab stop: this week, or the first box when there is none', async () => {
    const now = await mountSuspended(CalendarGrid, { props: { data: fixture() } })
    expect(now.findAll('[tabindex="0"]').map(e => [e.attributes('data-row'), e.attributes('data-box')])).toEqual([['36', '41']])
    for (const data of [BEFORE_BIRTH(), PAST_LAST_ROW()]) {
      const w = await mountSuspended(CalendarGrid, { props: { data } })
      expect(w.findAll('[tabindex="0"]').map(e => [e.attributes('data-row'), e.attributes('data-box')])).toEqual([['0', '0']])
      expect(w.findAll('[data-state="current"]')).toHaveLength(0)
    }
  })
  it('before birth: all ahead. past the last row: all lived', async () => {
    expect((await mountSuspended(CalendarGrid, { props: { data: BEFORE_BIRTH() } })).findAll('[data-state="ahead"]')).toHaveLength(4680)
    expect((await mountSuspended(CalendarGrid, { props: { data: PAST_LAST_ROW() } })).findAll('[data-state="lived"]')).toHaveLength(4680)
  })
})
```

`scripts/nexus-web/app/components/stats.test.ts`:

```ts
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { BEFORE_BIRTH, fixture, PAST_LAST_ROW } from '../../tests/fixtures'
import CalendarLegend from './CalendarLegend.vue'
import GridSkeleton from './GridSkeleton.vue'
import LifeCalendarView from './LifeCalendarView.vue'
import StatsBar from './StatsBar.vue'

describe('StatsBar', () => {
  it('shows the three numbers with separators and one decimal (pending Jack: the labels)', async () => {
    const w = await mountSuspended(StatsBar, { props: { totals: fixture().totals, loading: false } })
    expect(w.findAll('dt').map(e => e.text())).toEqual(['weeks lived', 'weeks left', 'lived'])
    expect(w.findAll('dd').map(e => e.text())).toEqual(['1,913', '2,766', '40.9%'])
  })
  it('edge cases keep the layout: 0 / 4,680 / 0.0% and 4,680 / 0 / 100.0%', async () => {
    expect((await mountSuspended(StatsBar, { props: { totals: BEFORE_BIRTH().totals, loading: false } })).findAll('dd').map(e => e.text())).toEqual(['0', '4,680', '0.0%'])
    expect((await mountSuspended(StatsBar, { props: { totals: PAST_LAST_ROW().totals, loading: false } })).findAll('dd').map(e => e.text())).toEqual(['4,680', '0', '100.0%'])
  })
  it('loading: bars, aria-busy and a polite live region; no numbers', async () => {
    const w = await mountSuspended(StatsBar, { props: { totals: null, loading: true } })
    expect(w.find('[aria-live="polite"]').attributes('aria-busy')).toBe('true')
    expect(w.findAll('.bar')).toHaveLength(3)
  })
  it('error forms show a dash', async () => {
    const w = await mountSuspended(StatsBar, { props: { totals: null, loading: false } })
    expect(w.findAll('dd').map(e => e.text())).toEqual(['–', '–', '–'])
  })
})

describe('CalendarLegend and GridSkeleton', () => {
  it('the legend names the three states in words', async () => {
    expect((await mountSuspended(CalendarLegend)).text()).toMatch(/Lived\s*This week\s*Ahead/)
  })
  it('the skeleton has one element per row, no per-box nodes, and is hidden from assistive technology', async () => {
    const w = await mountSuspended(GridSkeleton, { props: { rows: 90, ghost: false } })
    expect(w.attributes('aria-hidden')).toBe('true')
    expect(w.findAll('.srow')).toHaveLength(90)
    expect(w.findAll('[role="gridcell"]')).toHaveLength(0)
  })
})

describe('LifeCalendarView states keep the frame', () => {
  it('loaded: stats, legend, grid and the note', async () => {
    const w = await mountSuspended(LifeCalendarView, { props: { state: { kind: 'loaded', data: fixture() }, retrying: false } })
    expect(w.findAll('dd').map(e => e.text())).toEqual(['1,913', '2,766', '40.9%'])
    expect(w.find('[role="grid"]').exists()).toBe(true)
    expect(w.text()).toContain('Weeks count from each birthday.')
  })
  it('loading: skeleton and busy stats, no grid', async () => {
    const w = await mountSuspended(LifeCalendarView, { props: { state: { kind: 'loading' }, retrying: false } })
    expect(w.find('.skeleton').exists()).toBe(true)
    expect(w.find('[role="grid"]').exists()).toBe(false)
    expect(w.find('[aria-busy="true"]').exists()).toBe(true)
  })
  it('error, locked and empty: dashes, a ghost grid and a panel on top', async () => {
    for (const kind of ['error', 'locked', 'empty'] as const) {
      const w = await mountSuspended(LifeCalendarView, { props: { state: { kind }, retrying: false } })
      expect(w.findAll('dd').map(e => e.text())).toEqual(['–', '–', '–'])
      expect(w.find('.skeleton.ghost').exists()).toBe(true)
      expect(w.find('.panel').exists()).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm --filter @digismith/nexus-web test`
Expected: FAIL.

- [ ] **Step 3: Write the small components**

`scripts/nexus-web/app/components/StatItem.vue`:

```vue
<script setup lang="ts">
defineProps<{ label: string; value?: string; loading?: boolean }>()
</script>

<template>
  <div class="stat">
    <dt>{{ label }}</dt>
    <dd v-if="!loading">{{ value ?? '–' }}</dd>
    <dd v-else class="bar" aria-hidden="true" />
  </div>
</template>

<style scoped lang="scss">
.stat { display: flex; flex-direction: column-reverse; gap: 2px; }   // number above the label, label first in the DOM
dt { color: var(--ink-2); font-size: 13px; }
dd { margin: 0; font-size: 26px; font-weight: 650; letter-spacing: -0.02em; line-height: 1.15; min-height: 30px; }
.bar { width: 72px; height: 22px; margin-top: 4px; border-radius: 4px; background: var(--line); }
@media (min-width: 640px) { dt { font-size: 14px; } dd { font-size: 36px; min-height: 42px; } .bar { height: 30px; width: 96px; } }
</style>
```

`scripts/nexus-web/app/components/StatsBar.vue` (labels are the Designer's recommendation, **pending Jack**):

```vue
<script setup lang="ts">
import type { LifeCalendar } from '#life-schema'

const props = defineProps<{ totals: LifeCalendar['totals'] | null; loading: boolean }>()
const fmt = (n: number) => n.toLocaleString('en-US')
const lived = computed(() => props.totals ? fmt(props.totals.weeksLived) : undefined)
const left = computed(() => props.totals ? fmt(props.totals.weeksLeft) : undefined)
const percent = computed(() => props.totals ? `${props.totals.percentLived.toFixed(1)}%` : undefined)
</script>

<template>
  <div aria-live="polite" :aria-busy="loading ? 'true' : 'false'">
    <dl class="stats">
      <StatItem label="weeks lived" :value="lived" :loading="loading" />
      <StatItem label="weeks left" :value="left" :loading="loading" />
      <StatItem label="lived" :value="percent" :loading="loading" />
    </dl>
  </div>
</template>

<style scoped lang="scss">
.stats { display: flex; gap: 28px; margin: 0 0 16px; flex-wrap: nowrap; }
@media (min-width: 640px) { .stats { gap: 56px; } }
</style>
```

`scripts/nexus-web/app/components/CalendarLegend.vue`:

```vue
<template>
  <ul class="legend">
    <li><span class="sw lived" aria-hidden="true" />Lived</li>
    <li><span class="sw current" aria-hidden="true" />This week</li>
    <li><span class="sw ahead" aria-hidden="true" />Ahead</li>
  </ul>
</template>

<style scoped lang="scss">
.legend { display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 0 0 12px; padding: 0; list-style: none; color: var(--ink-2); font-size: 13px; }
li { display: inline-flex; align-items: center; gap: 8px; }
.sw { width: 12px; height: 12px; border-radius: 2px; display: inline-block; }
.lived { background: var(--ink); }
.current { background: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent); }
.ahead { border: 1px solid var(--ahead); }
</style>
```

Shared grid geometry, `scripts/nexus-web/app/assets/grid.scss` (imported by both the grid and the skeleton, so the skeleton has exactly the grid's height; this is the CLS guarantee):

```scss
// --box is derived from the grid's own width with a container query unit, so rows have exactly the same height
// in the real grid and in the skeleton (no layout shift when the data arrives). 52 boxes, 51 gaps, one age column.
@mixin grid-geometry {
  container-type: inline-size;
  --age-w: 24px;
  --box: calc((100cqw - var(--age-w) - 52 * var(--gap)) / 52);
  max-width: 880px;
  margin: 0 auto;
}
@mixin row-geometry {
  display: grid;
  grid-template-columns: var(--age-w) repeat(52, var(--box));
  grid-auto-rows: var(--box);
  gap: var(--gap);
  height: var(--box);
}
$decade-gap: 5px;
$ruler-h: 16px;
$ruler-gap: 4px;
```

`scripts/nexus-web/app/components/GridSkeleton.vue` (one element per row, the boxes are a CSS pattern):

```vue
<script setup lang="ts">
defineProps<{ rows: number; ghost: boolean }>()
</script>

<template>
  <div class="skeleton" :class="{ ghost }" aria-hidden="true">
    <div class="ruler-ph" />
    <div v-for="r in rows" :key="r" class="srow" :class="{ 'decade-end': r % 10 === 0 && r < rows }" />
  </div>
</template>

<style scoped lang="scss">
@use '../assets/grid' as g;
.skeleton { @include g.grid-geometry; animation: pulse 1.4s ease-in-out infinite; }
.ruler-ph { height: g.$ruler-h; margin-bottom: g.$ruler-gap; }   // same height as the real ruler row
.srow {
  @include g.row-geometry;
  display: block;   // the pattern draws the 52 boxes; no child nodes
  margin-bottom: var(--gap);
  margin-left: calc(var(--age-w) + var(--gap));
  width: calc(100% - var(--age-w) - var(--gap));
  background-image: linear-gradient(to right, var(--line) 0 var(--box), transparent var(--box) 100%);
  background-size: calc(var(--box) + var(--gap)) 100%;
  border-radius: var(--radius-box);
}
.decade-end { margin-bottom: calc(var(--gap) + #{g.$decade-gap}); }
.ghost { animation: none; opacity: 0.28; }
@keyframes pulse { 50% { opacity: 0.45; } }
</style>
```

The `.srow` rule sets `height: var(--box)` through `row-geometry`; its `display: block` override keeps that height. Rows are spaced by `--gap`, and a decade end adds `$decade-gap`. The real grid uses the same values and the same ruler height (step 4), so the skeleton and the grid have exactly the same height.

- [ ] **Step 4: Write `CalendarGrid.vue`**

```vue
<script setup lang="ts">
import { boxRange, formatLong } from '#days'
import type { LifeCalendar } from '#life-schema'

const props = defineProps<{ data: LifeCalendar }>()
const BOXES = 52
const cur = props.data.current
// the one tab stop: this week, or the first box when there is none
const startRow = cur?.row ?? 0
const startBox = cur?.box ?? 0

function stateOf(rowLived: number, age: number, b: number): 'lived' | 'current' | 'ahead' {
  if (b < rowLived) return 'lived'
  if (cur && cur.row === age && cur.box === b) return 'current'
  return 'ahead'
}
const WORD = { lived: 'lived', current: 'this week', ahead: 'ahead' } as const
function label(row: LifeCalendar['rows'][number], b: number, state: 'lived' | 'current' | 'ahead'): string {
  const r = boxRange(row, b)
  return `Age ${row.age}, week ${b + 1} of ${BOXES}, ${formatLong(r.from)} to ${formatLong(r.to)}, ${WORD[state]}`
}
const WEEK_MARKS = [0, 12, 25, 38, 51]
const lastRow = props.data.rows.length - 1
</script>

<template>
  <div class="grid-wrap">
  <div id="calendar-grid" v-once class="grid" role="grid" aria-label="Your life in weeks. One row per year of age, 52 boxes per row. Use the arrow keys to move between weeks." :aria-rowcount="data.rows.length + 1" :aria-colcount="BOXES + 1">
    <div class="row ruler" role="row">
      <span class="corner" role="columnheader">Age</span>
      <span v-for="m in WEEK_MARKS" :key="m" class="mark" role="columnheader" :style="{ gridColumn: m + 2 }">Week {{ m + 1 }}</span>
    </div>
    <div v-for="row in data.rows" :key="row.age" class="row" :class="{ 'decade-end': (row.age + 1) % 10 === 0 && row.age < lastRow }" role="row">
      <span class="age" :class="{ labelled: row.age % 10 === 0 }" role="rowheader">
        <span v-if="row.age % 10 === 0" aria-hidden="true">{{ row.age }}</span>
        <span class="sr-only">Age {{ row.age }}</span>
      </span>
      <div
        v-for="n in BOXES" :key="n"
        class="box" role="gridcell"
        :class="stateOf(row.lived, row.age, n - 1)"
        :data-row="row.age" :data-box="n - 1" :data-state="stateOf(row.lived, row.age, n - 1)"
        :tabindex="row.age === startRow && n - 1 === startBox ? 0 : -1"
        :aria-label="label(row, n - 1, stateOf(row.lived, row.age, n - 1))"
      />
    </div>
  </div>
  </div>
</template>

<style scoped lang="scss">
@use '../assets/grid' as g;
.grid { @include g.grid-geometry; }
.row { @include g.row-geometry; margin-bottom: var(--gap); }
.row.decade-end { margin-bottom: calc(var(--gap) + #{g.$decade-gap}); }
.ruler { height: g.$ruler-h; grid-auto-rows: auto; margin-bottom: g.$ruler-gap; color: var(--ink-2); font-size: 11px; line-height: g.$ruler-h; }
.corner { grid-column: 1; }
.mark { white-space: nowrap; }
.age { grid-column: 1; align-self: center; color: var(--ink-2); font-size: 11px; line-height: 1; }
.box { border-radius: var(--radius-box); outline: none; }
.lived { background: var(--ink); }
.ahead { box-shadow: inset 0 0 0 1px var(--ahead); }
.current { background: var(--accent); box-shadow: 0 0 0 2px var(--accent); position: relative; z-index: 1; }
.box:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; position: relative; z-index: 2; }
.box.current:focus-visible { outline-width: 3px; }
@media (forced-colors: active) {
  .lived { background: CanvasText; } .ahead { box-shadow: none; border: 1px solid GrayText; } .current { background: Highlight; box-shadow: none; }
}
</style>
```

Note: the `.srow` in the skeleton and `.row` here both start their boxes after the age column plus one gap, so the pattern lines up with the real boxes. `v-once` on the grid is safe because the parent re-creates the whole component with `:key` when the data changes (next step). The `v-once` stops Vue from walking 4,680 nodes again; the interaction in task 12 changes only DOM attributes and one separate tooltip component, never the cells' bindings.

- [ ] **Step 5: Fill `LifeCalendarLoaded.vue` and the view**

`LifeCalendarLoaded.vue`:

```vue
<script setup lang="ts">
import type { LifeCalendar } from '#life-schema'
defineProps<{ data: LifeCalendar }>()
</script>

<template>
  <div class="loaded">
    <StatsBar :totals="data.totals" :loading="false" />
    <CalendarLegend />
    <CalendarGrid :key="data.today + data.readAt" :data="data" />
    <p class="note">Weeks count from each birthday. The last box of a year takes the extra day or two.</p>
  </div>
</template>

<style scoped lang="scss">
.note { margin: 16px 0 0; color: var(--ink-2); font-size: 13px; }
</style>
```

Replace the body of `LifeCalendarView.vue`'s template with (stats and legend stay in every state so nothing jumps; the grid area is the skeleton while loading, the ghost grid under a panel on errors, and the real grid when loaded):

```vue
<template>
  <WidgetFrame title="Life Calendar" :meta="meta">
    <div id="calendar" class="area">
      <LifeCalendarLoaded v-if="state.kind === 'loaded'" :data="state.data" />
      <template v-else>
        <StatsBar :totals="null" :loading="state.kind === 'loading'" />
        <CalendarLegend />
        <GridSkeleton :rows="90" :ghost="state.kind !== 'loading'" />
        <StatePanel v-if="state.kind !== 'loading'" class="over" :kind="state.kind" :retrying="retrying" @retry="$emit('retry')" />
        <p class="note">Weeks count from each birthday. The last box of a year takes the extra day or two.</p>
      </template>
    </div>
  </WidgetFrame>
</template>
```

and in its `<style>` keep `.over` (top offset 120px so the panel sits over the ghost grid) and remove `.placeholder`. The note text is repeated in both branches so the frame height is the same in every state; move the note into a `WidgetFrame` `#note` slot if you prefer, then remove it from `LifeCalendarLoaded`. The skeleton and the grid both use `rows` = 90 in version 1.

- [ ] **Step 6: Run the tests, the type check and a generate**

Run: `pnpm --filter @digismith/nexus-web test` → PASS.
Run: `pnpm --filter @digismith/nexus-web typecheck` → no errors.
Run: `pnpm --filter @digismith/nexus-web generate` → succeeds. Open `scripts/nexus-web/.output/public/index.html` in a browser against the stub server later (task 15); for now confirm the HTML holds the skeleton rows and no data.
Check the pending-Jack items are visible in the code only as the Designer's recommendations (vermilion in `main.scss`, labels in `StatsBar.vue`, ages every 10 rows in `CalendarGrid.vue`).

- [ ] **Step 7: Commit**

```bash
git add -- scripts/nexus-web
git commit -m "feat(dgs-481): draw the life calendar grid, stats and legend" -- scripts/nexus-web
```

---

### Task 12: Tooltip, keyboard and touch

**Files:**
- Create: `scripts/nexus-web/app/utils/grid-nav.ts`, `scripts/nexus-web/app/utils/grid-nav.test.ts`, `scripts/nexus-web/app/utils/tooltip-place.ts`, `scripts/nexus-web/app/utils/tooltip-place.test.ts`, `scripts/nexus-web/app/components/WeekTooltip.vue`, `scripts/nexus-web/app/components/interaction.test.ts`
- Modify: `scripts/nexus-web/app/components/CalendarGrid.vue`

**Interfaces:**
- Produces: `nextCell(key: string, ctrl: boolean, cur: {row: number; box: number}, rows: number): {row: number; box: number} | null`; `nearestBox(x: number, y: number, probe: (x: number, y: number) => Element | null, radius?: number): Element | null`; `placeTooltip(anchor: {x: number; y: number}, size: {w: number; h: number}, view: {w: number; h: number}): {x: number; y: number}`; `<WeekTooltip :info :mode />` where `info = { age, week, from, to, state } | null` and `mode: 'pointer' | 'readout'`.

- [ ] **Step 1: Write the failing unit tests**

`scripts/nexus-web/app/utils/grid-nav.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { nearestBox, nextCell } from './grid-nav'

const at = (row: number, box: number) => ({ row, box })
describe('nextCell (the Designer keys)', () => {
  it('Left and Right move one week and stop at the row ends of the grid', () => {
    expect(nextCell('ArrowRight', false, at(3, 10), 90)).toEqual(at(3, 11))
    expect(nextCell('ArrowLeft', false, at(3, 10), 90)).toEqual(at(3, 9))
    expect(nextCell('ArrowRight', false, at(3, 51), 90)).toEqual(at(4, 0))   // wraps to the next year
    expect(nextCell('ArrowLeft', false, at(3, 0), 90)).toEqual(at(2, 51))
    expect(nextCell('ArrowLeft', false, at(0, 0), 90)).toEqual(at(0, 0))
    expect(nextCell('ArrowRight', false, at(89, 51), 90)).toEqual(at(89, 51))
  })
  it('Up and Down keep the week and change the year', () => {
    expect(nextCell('ArrowDown', false, at(3, 10), 90)).toEqual(at(4, 10))
    expect(nextCell('ArrowUp', false, at(3, 10), 90)).toEqual(at(2, 10))
    expect(nextCell('ArrowUp', false, at(0, 10), 90)).toEqual(at(0, 10))
    expect(nextCell('ArrowDown', false, at(89, 10), 90)).toEqual(at(89, 10))
  })
  it('Home and End go to the first and last week of the row; with Ctrl, to the first and last box', () => {
    expect(nextCell('Home', false, at(3, 10), 90)).toEqual(at(3, 0))
    expect(nextCell('End', false, at(3, 10), 90)).toEqual(at(3, 51))
    expect(nextCell('Home', true, at(3, 10), 90)).toEqual(at(0, 0))
    expect(nextCell('End', true, at(3, 10), 90)).toEqual(at(89, 51))
  })
  it('Page Up and Page Down move 10 years, clamped', () => {
    expect(nextCell('PageDown', false, at(3, 10), 90)).toEqual(at(13, 10))
    expect(nextCell('PageUp', false, at(3, 10), 90)).toEqual(at(0, 10))
    expect(nextCell('PageDown', false, at(85, 10), 90)).toEqual(at(89, 10))
  })
  it('other keys return null', () => { expect(nextCell('a', false, at(0, 0), 90)).toBeNull() })
})

describe('nearestBox (touch, within 14 px)', () => {
  const box = (name: string) => ({ name }) as unknown as Element
  it('returns the box under the finger when there is one', () => {
    expect(nearestBox(10, 10, () => box('here'))).toEqual(box('here'))
  })
  it('probes around the finger, nearest ring first, and gives up beyond the radius', () => {
    const seen: [number, number][] = []
    const found = nearestBox(100, 100, (x, y) => { seen.push([x, y]); return x === 107 && y === 100 ? box('near') : null })
    expect(found).toEqual(box('near'))
    expect(seen[0]).toEqual([100, 100])
    expect(nearestBox(100, 100, () => null)).toBeNull()
    expect(nearestBox(100, 100, (x, y) => (Math.hypot(x - 100, y - 100) > 14 ? box('far') : null))).toBeNull()
  })
})
```

`scripts/nexus-web/app/utils/tooltip-place.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { placeTooltip } from './tooltip-place'

const size = { w: 200, h: 60 }, view = { w: 1000, h: 800 }
describe('placeTooltip', () => {
  it('puts the tooltip 14 px up and right of the pointer', () => {
    expect(placeTooltip({ x: 100, y: 300 }, size, view)).toEqual({ x: 114, y: 300 - 14 - 60 })
  })
  it('flips left near the right edge and below near the top edge', () => {
    expect(placeTooltip({ x: 950, y: 300 }, size, view).x).toBe(950 - 14 - 200)
    expect(placeTooltip({ x: 100, y: 20 }, size, view).y).toBe(20 + 14)
  })
  it('never leaves the window', () => {
    const p = placeTooltip({ x: 5, y: 5 }, { w: 2000, h: 2000 }, view)
    expect(p.x).toBeGreaterThanOrEqual(0)
    expect(p.y).toBeGreaterThanOrEqual(0)
  })
})
```

`scripts/nexus-web/app/components/interaction.test.ts`:

```ts
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { fixture } from '../../tests/fixtures'
import CalendarGrid from './CalendarGrid.vue'
import WeekTooltip from './WeekTooltip.vue'

const cell = (w: any, r: number, b: number) => w.find(`[data-row="${r}"][data-box="${b}"]`)
async function grid() { return mountSuspended(CalendarGrid, { props: { data: fixture() }, attachTo: document.body }) }

describe('WeekTooltip', () => {
  it('shows the Designer text: age and week, date range, state', async () => {
    const w = await mountSuspended(WeekTooltip, { props: { mode: 'pointer', info: { age: 36, week: 42, from: '2026-10-15', to: '2026-10-21', state: 'current' } } })
    expect(w.attributes('role')).toBe('tooltip')
    expect(w.text()).toContain('Age 36 · Week 42 of 52')
    expect(w.text()).toContain('15 Oct 2026 – 21 Oct 2026')
    expect(w.text()).toContain('This week')
  })
  it('the touch readout is a status region and shows the same text', async () => {
    const w = await mountSuspended(WeekTooltip, { props: { mode: 'readout', info: { age: 0, week: 1, from: '1990-01-01', to: '1990-01-07', state: 'lived' } } })
    expect(w.attributes('role')).toBe('status')
    expect(w.text()).toContain('Lived')
  })
  it('renders nothing when there is no info', async () => {
    expect((await mountSuspended(WeekTooltip, { props: { mode: 'pointer', info: null } })).find('.tip').exists()).toBe(false)
  })
})

describe('keyboard on the grid', () => {
  it('arrow keys move the one tab stop and focus, and describe the box by the tooltip', async () => {
    const w = await grid()
    const start = cell(w, 36, 41)
    ;(start.element as HTMLElement).focus()
    await start.trigger('keydown', { key: 'ArrowRight' })
    expect(cell(w, 36, 42).attributes('tabindex')).toBe('0')
    expect(start.attributes('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(cell(w, 36, 42).element)
    expect(cell(w, 36, 42).attributes('aria-describedby')).toBe('week-tooltip')
    expect(w.findAll('[tabindex="0"]')).toHaveLength(1)
    w.unmount()
  })
  it('focus shows the tooltip over the box; Escape hides it and removes aria-describedby', async () => {
    const w = await grid()
    const c = cell(w, 10, 5)
    ;(c.element as HTMLElement).focus()
    await c.trigger('focusin')
    expect(document.getElementById('week-tooltip')?.textContent).toContain('Age 10 · Week 6 of 52')
    await c.trigger('keydown', { key: 'Escape' })
    expect(document.getElementById('week-tooltip')).toBeNull()
    expect(c.attributes('aria-describedby')).toBeUndefined()
    w.unmount()
  })
  it('hover with a mouse shows it, leaving hides it; there is one tooltip element only', async () => {
    const w = await grid()
    await cell(w, 36, 41).trigger('pointermove', { pointerType: 'mouse', clientX: 100, clientY: 100 })
    expect(document.querySelectorAll('#week-tooltip')).toHaveLength(1)
    expect(document.getElementById('week-tooltip')?.textContent).toContain('This week')
    await w.find('[role="grid"]').trigger('pointerleave', { pointerType: 'mouse' })
    expect(document.getElementById('week-tooltip')).toBeNull()
    w.unmount()
  })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm --filter @digismith/nexus-web test`
Expected: FAIL.

- [ ] **Step 3: Write the pure utils**

`scripts/nexus-web/app/utils/grid-nav.ts`:

```ts
export interface Cell { row: number; box: number }
const BOXES = 52

// The Designer's keys (ui-design.md section 8). null = not a grid key.
export function nextCell(key: string, ctrl: boolean, cur: Cell, rows: number): Cell | null {
  const last = rows - 1
  const clampRow = (r: number) => Math.max(0, Math.min(last, r))
  switch (key) {
    case 'ArrowRight': return cur.box < BOXES - 1 ? { row: cur.row, box: cur.box + 1 } : cur.row < last ? { row: cur.row + 1, box: 0 } : cur
    case 'ArrowLeft': return cur.box > 0 ? { row: cur.row, box: cur.box - 1 } : cur.row > 0 ? { row: cur.row - 1, box: BOXES - 1 } : cur
    case 'ArrowDown': return { row: clampRow(cur.row + 1), box: cur.box }
    case 'ArrowUp': return { row: clampRow(cur.row - 1), box: cur.box }
    case 'Home': return ctrl ? { row: 0, box: 0 } : { row: cur.row, box: 0 }
    case 'End': return ctrl ? { row: last, box: BOXES - 1 } : { row: cur.row, box: BOXES - 1 }
    case 'PageDown': return { row: clampRow(cur.row + 10), box: cur.box }
    case 'PageUp': return { row: clampRow(cur.row - 10), box: cur.box }
    default: return null
  }
}

// Touch: a 5 px box is smaller than a finger, so look for the nearest box within `radius` px, nearest ring first.
export function nearestBox(x: number, y: number, probe: (x: number, y: number) => Element | null, radius = 14): Element | null {
  const direct = probe(x, y)
  if (direct) return direct
  for (let r = 3.5; r <= radius; r += 3.5) {
    for (let a = 0; a < 8; a++) {
      const el = probe(Math.round(x + r * Math.cos((a * Math.PI) / 4)), Math.round(y + r * Math.sin((a * Math.PI) / 4)))
      if (el) return el
    }
  }
  return null
}
```

(The unit test's probe for `107, 100` is hit on the ring `r = 7`, angle 0: `100 + 7*cos(0) = 107`, `100 + 7*sin(0) = 100`.)

`scripts/nexus-web/app/utils/tooltip-place.ts`:

```ts
const OFFSET = 14

// Mouse tooltip: 14 px up and right of the pointer, flipped to stay inside the window.
export function placeTooltip(anchor: { x: number; y: number }, size: { w: number; h: number }, view: { w: number; h: number }): { x: number; y: number } {
  let x = anchor.x + OFFSET
  let y = anchor.y - OFFSET - size.h
  if (x + size.w > view.w) x = anchor.x - OFFSET - size.w
  if (y < 0) y = anchor.y + OFFSET
  return { x: Math.max(0, Math.min(x, Math.max(0, view.w - size.w))), y: Math.max(0, Math.min(y, Math.max(0, view.h - size.h))) }
}
```

- [ ] **Step 4: Write `WeekTooltip.vue`**

```vue
<script setup lang="ts">
import { formatShort } from '#days'

export interface TipInfo { age: number; week: number; from: string; to: string; state: 'lived' | 'current' | 'ahead' }
defineProps<{ info: TipInfo | null; mode: 'pointer' | 'readout' }>()
const WORD = { lived: 'Lived', current: 'This week', ahead: 'Ahead' } as const
</script>

<template>
  <div v-if="info" id="week-tooltip" class="tip" :class="mode" :role="mode === 'pointer' ? 'tooltip' : 'status'">
    <strong>Age {{ info.age }} · Week {{ info.week }} of 52</strong>
    <span>{{ formatShort(info.from) }} – {{ formatShort(info.to) }}</span>
    <span class="state"><i class="sw" :class="info.state" aria-hidden="true" />{{ WORD[info.state] }}</span>
  </div>
</template>

<style scoped lang="scss">
.tip { display: grid; gap: 2px; padding: 8px 12px; border-radius: 8px; background: var(--ink); color: var(--bg); font-size: 13px; line-height: 1.4; box-shadow: 0 4px 16px rgb(0 0 0 / 0.25); pointer-events: none; z-index: 20; animation: fade 120ms ease-out; }
.pointer { position: fixed; left: 0; top: 0; will-change: transform; }
.readout { position: fixed; left: 16px; right: 16px; bottom: 16px; font-size: 15px; }
.state { display: inline-flex; align-items: center; gap: 8px; }
.sw { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.lived { background: var(--bg); }
.current { background: var(--accent); }
.ahead { box-shadow: inset 0 0 0 1px var(--bg); }
@keyframes fade { from { opacity: 0; } }
</style>
```

- [ ] **Step 5: Wire the interaction into `CalendarGrid.vue`**

Add to the `<script setup>` (one delegated listener on the grid root; no listener per box; the tooltip is the one element and is teleported to `body` so it is never clipped and there is one in the document):

```ts
import { boxRange } from '#days'
import { nearestBox, nextCell } from '../utils/grid-nav'
import { placeTooltip } from '../utils/tooltip-place'
import type { TipInfo } from './WeekTooltip.vue'

const tip = ref<TipInfo | null>(null)
const mode = ref<'pointer' | 'readout'>('pointer')
const selected = ref<HTMLElement | null>(null)
let described: HTMLElement | null = null
let frame = 0

function cellOf(target: EventTarget | null): HTMLElement | null {
  return (target as HTMLElement | null)?.closest?.('[data-row]') ?? null
}
function infoOf(el: HTMLElement): TipInfo {
  const row = props.data.rows[Number(el.dataset.row)]
  const box = Number(el.dataset.box)
  const r = boxRange(row, box)
  return { age: row.age, week: box + 1, from: r.from, to: r.to, state: el.dataset.state as TipInfo['state'] }
}
function describe(el: HTMLElement | null) {
  described?.removeAttribute('aria-describedby')
  described = el
  el?.setAttribute('aria-describedby', 'week-tooltip')
}
function move(x: number, y: number) {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    const t = document.getElementById('week-tooltip')
    if (!t) return
    const p = placeTooltip({ x, y }, { w: t.offsetWidth, h: t.offsetHeight }, { w: innerWidth, h: innerHeight })
    t.style.transform = `translate(${p.x}px, ${p.y}px)`
  })
}
function hide() { tip.value = null; describe(null); selected.value?.classList.remove('selected'); selected.value = null }

function onPointerMove(e: PointerEvent) {
  if (e.pointerType === 'touch') return
  const el = cellOf(e.target)
  if (!el) { hide(); return }
  mode.value = 'pointer'
  if (el !== described) { tip.value = infoOf(el); describe(el) }
  move(e.clientX, e.clientY)
}
function onPointerUp(e: PointerEvent) {
  if (e.pointerType !== 'touch') return
  const el = nearestBox(e.clientX, e.clientY, (x, y) => cellOf(document.elementFromPoint(x, y))) as HTMLElement | null
  hide()
  if (!el) return
  mode.value = 'readout'
  selected.value = el; el.classList.add('selected')
  tip.value = infoOf(el)
}
function activate(el: HTMLElement) {
  document.querySelector('#calendar-grid [tabindex="0"]')?.setAttribute('tabindex', '-1')
  el.setAttribute('tabindex', '0')
  el.focus()
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') { hide(); return }
  const el = cellOf(e.target)
  if (!el) return
  const next = nextCell(e.key, e.ctrlKey || e.metaKey, { row: Number(el.dataset.row), box: Number(el.dataset.box) }, props.data.rows.length)
  if (!next) return
  e.preventDefault()
  const target = document.querySelector<HTMLElement>(`#calendar-grid [data-row="${next.row}"][data-box="${next.box}"]`)
  if (target) { activate(target); showAnchored(target) }
}
function showAnchored(el: HTMLElement) {
  mode.value = 'pointer'
  tip.value = infoOf(el); describe(el)
  const r = el.getBoundingClientRect()
  move(r.left + r.width / 2, r.top)
}
function onFocusIn(e: FocusEvent) {
  const el = cellOf(e.target)
  if (!el) return
  let visible = true
  try { visible = el.matches(':focus-visible') } catch { visible = true }   // a mouse click must not show the anchored tooltip
  if (visible) showAnchored(el)
}
function onFocusOut() { hide() }
onBeforeUnmount(() => cancelAnimationFrame(frame))
```

and on the grid root element add `@pointermove="onPointerMove" @pointerleave="hide" @pointerup="onPointerUp" @keydown="onKeydown" @focusin="onFocusIn" @focusout="onFocusOut"`, and inside `.grid-wrap`, after the `v-once` grid `div` (not inside it, because `v-once` would freeze it), add:

```vue
<Teleport to="body"><WeekTooltip :info="tip" :mode="mode" /></Teleport>
```

Add `.selected { outline: 2px solid var(--ink); outline-offset: 1px; }` to the grid styles. (`:focus-visible` in `onFocusIn` keeps a mouse click from showing the anchored tooltip. If happy-dom does not support it, the `catch` treats focus as visible; the real rule is covered in the Playwright test of task 15.)

Also set the Designer's "this week" ring so it is visible under the roving focus ring (already in `.box.current:focus-visible` in task 11).

- [ ] **Step 6: Run the tests and the type check**

Run: `pnpm --filter @digismith/nexus-web test` → PASS. Run: `pnpm --filter @digismith/nexus-web typecheck` → no errors.
Tell the Maestro in the commit body... no body; titles only. Note for the review: the tooltip is non-interactive by the Designer's decision (`pointer-events: none`), and the same text is in each box's accessible name. WCAG 1.4.13 "hoverable" is therefore a **documented exception**; task 16 records it in the test file with this reason and it needs Jack's sign-off.

- [ ] **Step 7: Commit**

```bash
git add -- scripts/nexus-web
git commit -m "feat(dgs-481): add the tooltip, keyboard and touch interaction" -- scripts/nexus-web
```

---

### Task 13: Build script and the first deploy

**Files:**
- Create: `scripts/nexus-web/build-www.sh`, `scripts/nexus-web/build-www.test.ts`, `scripts/nexus-web/health-check.mjs`, `scripts/nexus-web/health-check.test.ts`, `scripts/nexus-web/tests/unit/built-page.test.ts`
- Modify: `scripts/nexus-web/package.json` (scripts), `vitest.config.ts` (root: nothing; the web tests run in the page package)

**Interfaces:**
- Produces: `sh scripts/nexus-web/build-www.sh` (env `DEPOT`, `SKIP_STORYBOOK=1` until task 14): runs `nuxt generate`, copies `.output/public` into a new folder `$DEPOT/nexus/www.d/<stamp>/`, adds `storybook/` when `storybook-static/` exists, then repoints the symlink `$DEPOT/nexus/www` at the new folder with one rename. The old build folders are kept (no delete). `node scripts/nexus-web/health-check.mjs` prints `ok` or `fail: <check name>` and never prints a number from the response.
- This task ends with the runbook for the **first deploy**, which the Maestro runs (the builder does not restart anything).

- [ ] **Step 1: Write the failing tests**

`scripts/nexus-web/tests/unit/built-page.test.ts` (runs against the output of `pnpm generate`; the test script generates first):

```ts
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const OUT = join(__dirname, '../../.output/public')
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)])
}
describe.skipIf(!existsSync(OUT))('the generated page', () => {
  it('has an index.html with the shell and the skeleton, and no calendar data', () => {
    const html = readFileSync(join(OUT, 'index.html'), 'utf8')
    expect(html).toContain('<h1 class="sr-only">Dashboard</h1>')
    expect(html).toContain('Life Calendar')
    expect(html).not.toMatch(/weeksLived|percentLived|birthDate|lifeYears/)
  })
  it('no built file holds the fake profile or a response shape', () => {
    for (const f of files(OUT).filter(f => /\.(html|js|json|css)$/.test(f))) {
      const text = readFileSync(f, 'utf8')
      expect(text.includes('1990-01-01'), f).toBe(false)
    }
  })
  it('the only API path the page knows is /api/v1/life-calendar', () => {
    const js = files(OUT).filter(f => f.endsWith('.js')).map(f => readFileSync(f, 'utf8')).join('\n')
    const paths = new Set(js.match(/\/api\/[a-z0-9/_-]+/g) ?? [])
    expect([...paths].every(p => p.startsWith('/api/v1/life-calendar') || p === '/api/' || p === '/api')).toBe(true)
  })
})
```

`scripts/nexus-web/build-www.test.ts` (uses a fake `pnpm` on PATH, so no real build runs):

```ts
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'www-test-'))
  const bin = join(root, 'bin'); mkdirSync(bin)
  // a fake pnpm: "generate" makes .output/public/index.html in the web folder; "build-storybook" makes storybook-static/
  writeFileSync(join(bin, 'pnpm'), `#!/bin/sh
case "$*" in
  *generate*) mkdir -p "$WEB/.output/public/_nuxt" && echo "<h1>page $STAMP</h1>" > "$WEB/.output/public/index.html" && echo x > "$WEB/.output/public/_nuxt/a.js" ;;
  *build-storybook*) mkdir -p "$WEB/storybook-static" && echo "<h1>sb</h1>" > "$WEB/storybook-static/index.html" ;;
esac
`)
  chmodSync(join(bin, 'pnpm'), 0o755)
  return { root, bin, depot: join(root, 'depot') }
}
const run = (s: ReturnType<typeof setup>, extra: Record<string, string> = {}) =>
  spawnSync('sh', [join(HERE, 'build-www.sh')], { encoding: 'utf8', env: { PATH: `${s.bin}:${process.env.PATH}`, HOME: s.root, DEPOT: s.depot, WEB: HERE, ...extra } })

describe('build-www.sh', () => {
  it('builds into www.d/<stamp>, points the www symlink at it, and serves index.html through it', () => {
    const s = setup()
    const r = run(s, { STAMP: '1', SKIP_STORYBOOK: '1' })
    expect(r.status, r.stderr).toBe(0)
    expect(lstatSync(join(s.depot, 'nexus/www')).isSymbolicLink()).toBe(true)
    expect(readFileSync(join(s.depot, 'nexus/www/index.html'), 'utf8')).toContain('page 1')
    expect(existsSync(join(s.depot, 'nexus/www/storybook'))).toBe(false)
  })
  it('a second run switches the symlink to the new build and keeps the old one', () => {
    const s = setup()
    run(s, { STAMP: '1', SKIP_STORYBOOK: '1' })
    const first = readlinkSync(join(s.depot, 'nexus/www'))
    run(s, { STAMP: '2', SKIP_STORYBOOK: '1' })
    expect(readlinkSync(join(s.depot, 'nexus/www'))).not.toBe(first)
    expect(readFileSync(join(s.depot, 'nexus/www/index.html'), 'utf8')).toContain('page 2')
    expect(readdirSync(join(s.depot, 'nexus/www.d'))).toHaveLength(2)   // nothing is deleted
  })
  it('adds storybook/ next to the page when it is built', () => {
    const s = setup()
    expect(run(s, { STAMP: '1' }).status).toBe(0)
    expect(readFileSync(join(s.depot, 'nexus/www/storybook/index.html'), 'utf8')).toContain('sb')
  })
  it('refuses to replace a real directory called www and leaves it alone', () => {
    const s = setup()
    mkdirSync(join(s.depot, 'nexus/www'), { recursive: true })
    const r = run(s, { STAMP: '1', SKIP_STORYBOOK: '1' })
    expect(r.status).not.toBe(0)
    expect(lstatSync(join(s.depot, 'nexus/www')).isDirectory()).toBe(true)
  })
})
```

`scripts/nexus-web/health-check.test.ts`:

```ts
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { fixture } from './tests/fixtures'

const HERE = dirname(fileURLToPath(import.meta.url))
function check(api: number, page: string, apiBody: unknown) {
  return new Promise<{ out: string; code: number | null }>(resolve => {
    const s = createServer((req, res) => {
      if (req.url === '/api/v1/life-calendar') { res.writeHead(api, { 'content-type': 'application/json' }); res.end(JSON.stringify(apiBody)) }
      else if (req.url === '/' || req.url === '/storybook/') { res.writeHead(200); res.end(page) }
      else { res.writeHead(404); res.end() }
    }).listen(0, '127.0.0.1', () => {
      const port = (s.address() as AddressInfo).port
      const r = spawnSync('node', [join(HERE, 'health-check.mjs')], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '', HEALTH_API: `http://127.0.0.1:${port}`, HEALTH_SITE: `http://127.0.0.1:${port}`, HEALTH_STORYBOOK: '1' } })
      s.close(); resolve({ out: r.stdout + r.stderr, code: r.status })
    })
  })
}
describe('health-check.mjs', () => {
  it('prints ok and exits 0 when the API, the page and Storybook answer', async () => {
    const r = await check(200, '<h1 class="sr-only">Dashboard</h1>', fixture())
    expect(r.out.trim()).toBe('ok'); expect(r.code).toBe(0)
  })
  it('prints only the failing check name, never a number or a date from the response', async () => {
    const r = await check(503, '<h1 class="sr-only">Dashboard</h1>', { error: 'key_unavailable' })
    expect(r.code).toBe(1)
    expect(r.out.trim()).toBe('fail: life-calendar')
  })
  it('fails when the page does not hold the dashboard heading', async () => {
    expect((await check(200, '<p>x</p>', fixture())).out.trim()).toBe('fail: page')
  })
  it('a body that is not plausible (nothing lived) fails without printing the totals', async () => {
    const bad = { ...fixture('1989-12-31') }
    const r = await check(200, '<h1 class="sr-only">Dashboard</h1>', bad)
    expect(r.out.trim()).toBe('fail: life-calendar-range')
    expect(r.out).not.toMatch(/\d{4}/)
  })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm --filter @digismith/nexus-web test` and `pnpm --filter @digismith/nexus-web exec vitest run --root . build-www.test.ts health-check.test.ts` (the two root-level test files are outside `include`; add `'*.test.ts'` to `include` in `scripts/nexus-web/vitest.config.ts` and run `pnpm --filter @digismith/nexus-web test`).
Expected: FAIL (scripts missing).

- [ ] **Step 3: Write `build-www.sh`**

```sh
#!/bin/sh
# Builds the page (and Storybook when it is built) from this repo checkout into the depot (DGS-481).
# The result goes to $DEPOT/nexus/www.d/<stamp>/ and the symlink $DEPOT/nexus/www is pointed at it with one rename, so Caddy
# never sees a half-built site. Old build folders are kept: nothing is deleted here (deletes need Jack).
# Env: DEPOT (default ~/.digismith-depot), SKIP_STORYBOOK=1 (page only), WEB (the web folder, tests only), STAMP (tests only).
set -eu
WEB="${WEB:-$(cd "$(dirname "$0")" && pwd)}"
DEPOT="${DEPOT:-$HOME/.digismith-depot}"
case "$DEPOT" in *'|'*|*'&'*|*'<'*|*'>'*|*'"'*|*'$'*|*'`'*|*'\'*) echo "build-www: DEPOT may not contain | & < > \" \$ \` or a backslash" >&2; exit 1;; esac
NEXUS="$DEPOT/nexus"
LINK="$NEXUS/www"
if [ -e "$LINK" ] && [ ! -L "$LINK" ]; then echo "build-www: $LINK is a real directory; move it away first (Jack decides)" >&2; exit 1; fi
STAMP="${STAMP:-$(date +%Y%m%d%H%M%S)}"
NEW="$NEXUS/www.d/$STAMP"
mkdir -p "$NEXUS/www.d"
[ ! -e "$NEW" ] || { echo "build-www: $NEW already exists" >&2; exit 1; }

(cd "$WEB" && pnpm generate) || { echo "build-www: the page build failed" >&2; exit 1; }
mkdir -p "$NEW"
cp -R "$WEB/.output/public/." "$NEW/"
if [ "${SKIP_STORYBOOK:-}" != 1 ]; then
  (cd "$WEB" && pnpm build-storybook) || { echo "build-www: the Storybook build failed" >&2; exit 1; }
  mkdir -p "$NEW/storybook"
  cp -R "$WEB/storybook-static/." "$NEW/storybook/"
fi
# one rename: make a new symlink next to the old one, then move it over (-h: do not follow the old symlink)
ln -s "www.d/$STAMP" "$NEXUS/www.next"
mv -fh "$NEXUS/www.next" "$LINK"
echo "build-www: $LINK -> www.d/$STAMP"
```

In `scripts/nexus-web/package.json` scripts add `"build-storybook": "nuxt build-storybook"` (confirmed in task 14; until then the test fakes `pnpm`). The `build-www.sh` file must be executable-agnostic: it is run as `sh scripts/nexus-web/build-www.sh`.

- [ ] **Step 4: Write `health-check.mjs`**

```js
// Health check for the life dashboard (DGS-481). Prints "ok" or "fail: <check>" and nothing else.
// It never prints anything from the response: the totals are derived from the birth date.
// Env: HEALTH_API (default http://127.0.0.1:4300), HEALTH_SITE (default https://127.0.0.1:8443 with Host pazurite.com), HEALTH_STORYBOOK=1 to check /storybook/.
import https from 'node:https'
import http from 'node:http'

const API = process.env.HEALTH_API ?? 'http://127.0.0.1:4300'
const SITE = process.env.HEALTH_SITE ?? 'https://127.0.0.1:8443'

function get(base, path) {
  return new Promise(resolve => {
    const u = new URL(path, base)
    const mod = u.protocol === 'https:' ? https : http
    const req = mod.get({ host: u.hostname, port: u.port, path: u.pathname, headers: { host: u.protocol === 'https:' ? 'pazurite.com' : u.host }, servername: 'pazurite.com', rejectUnauthorized: u.protocol !== 'https:' || u.hostname !== '127.0.0.1' }, res => {
      let body = ''
      res.on('data', d => { body += d })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
    })
    req.on('error', () => resolve({ status: 0, body: '' }))
    req.setTimeout(10_000, () => { req.destroy(); resolve({ status: 0, body: '' }) })
  })
}
const fail = name => { console.log(`fail: ${name}`); process.exit(1) }

const cal = await get(API, '/api/v1/life-calendar')
if (cal.status !== 200) fail('life-calendar')
let json
try { json = JSON.parse(cal.body) } catch { fail('life-calendar') }
const t = json?.totals
if (!t || !(t.weeksLived > 0 && t.weeksLived < t.weeksTotal && t.weeksLeft >= 0) || 'birthDate' in json) fail('life-calendar-range')

const power = await get(API, '/api/v1/power-metrics')
if (power.status !== 200) fail('power-metrics')

const page = await get(SITE, '/')
if (page.status !== 200 || !page.body.includes('<h1 class="sr-only">Dashboard</h1>')) fail('page')

if (process.env.HEALTH_STORYBOOK === '1') {
  const sb = await get(SITE, '/storybook/')
  if (sb.status !== 200) fail('storybook')
}
console.log('ok')
```

Note for the test: in the test every request goes to the same fake server, which answers `/api/v1/power-metrics` with 404, so the power check would fail. Make the fake server in `health-check.test.ts` answer `/api/v1/power-metrics` with 200 (add that branch) before running.

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @digismith/nexus-web test` → PASS (the built-page test is skipped unless `.output/public` exists; run `pnpm --filter @digismith/nexus-web generate` first and run it again → PASS).

- [ ] **Step 6: Commit**

```bash
git add -- scripts/nexus-web
git commit -m "feat(dgs-481): add the www build script and the health check" -- scripts/nexus-web
```

- [ ] **Step 7: The first-deploy runbook (the Maestro runs it; the builder stops after step 6 and reports)**

Preconditions: the branch is merged; `pnpm install` has run in the checkout; the private input file exists at `~/.digismith-depot/nexus/profile.private.json` (mode 600).

1. `sh scripts/nexus-api/install.sh` (copies the API, `nexus-shared` and `seed-profile.ts` into the depot, runs `pnpm install --prod` there).
2. `sh scripts/caddy/install.sh` (copies the Caddyfile and `caddy-run`).
3. `SKIP_STORYBOOK=1 sh scripts/nexus-web/build-www.sh` (the first deploy needs no Storybook; the second deploy adds it after task 14).
4. Stop the Nexus API (`launchctl bootout gui/$(id -u)/com.jazurite.digismith.nexus-api`), run `node --experimental-strip-types ~/.digismith-depot/nexus-api/seed-profile.ts` (expect no output and exit 0; check `ls -l ~/.digismith-depot/nexus/profile.key` shows `-rw-------`), start the API (`launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.jazurite.digismith.nexus-api.plist`). Use the exact `launchctl` form the Maestro used for earlier restarts.
5. Restart Caddy the same way (the Caddyfile changed).
6. `node scripts/nexus-web/health-check.mjs` → expect `ok`.
7. Open `https://pazurite.com/` on a tailnet device and look at the page (Jack's look at it is the morning acceptance).
8. Do not delete `profile.private.json`; Jack decides.

---
### Task 14: Storybook and the story catalogue, served at /storybook/

**Files:**
- Create: `scripts/nexus-web/.storybook/main.ts`, `scripts/nexus-web/.storybook/preview.ts`, `scripts/nexus-web/app/components/LifeCalendarView.stories.ts`, `StatePanel.stories.ts`, `StatsBar.stories.ts`, `CalendarLegend.stories.ts`, `CalendarGrid.stories.ts`, `WeekTooltip.stories.ts`, `AppButton.stories.ts`, `GridSkeleton.stories.ts`, `WidgetFrame.stories.ts`, `DashboardHeader.stories.ts` (all in `app/components/`), `scripts/nexus-web/tests/unit/stories.test.ts`
- Modify: `scripts/nexus-web/nuxt.config.ts`, `scripts/nexus-web/package.json`, `scripts/nexus-web/app/components/WeekTooltip.vue` (an `inline` prop), `scripts/nexus-web/vitest.config.ts`

**Interfaces:**
- Produces: story ids used by tasks 16 and 17: `widget-life-calendar--loaded`, `--loading`, `--api-error`, `--key-unavailable`, `--empty`, `--before-birth`, `--past-ninety-years`. `pnpm --filter @digismith/nexus-web build-storybook` writes `scripts/nexus-web/storybook-static/` (with `index.json`, `iframe.html`). `build-www.sh` (task 13) already copies it to `www/storybook/`.

- [ ] **Step 1: Add the dependencies and confirm the commands**

Add to `scripts/nexus-web/package.json` `devDependencies` (exact): `"storybook": "10.6.2"`, `"@nuxtjs/storybook": "10.0.1"`, `"@storybook/addon-a11y": "10.6.2"`; add scripts `"storybook": "nuxt storybook"` and `"build-storybook": "nuxt build-storybook"`; add `modules: ['@nuxtjs/storybook']` to `nuxt.config.ts`. Run `pnpm install`.
Then read `scripts/nexus-web/node_modules/@nuxtjs/storybook/README.md` and confirm: the two commands above, the framework name used in `.storybook/main.ts` (`@storybook-vue/nuxt`) and the preview type import. If any differs, use the README's form and tell the Maestro; the files below keep their meaning.

- [ ] **Step 2: Write the failing catalogue test**

`scripts/nexus-web/tests/unit/stories.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = join(__dirname, '../../app/components')
const stories = readdirSync(DIR).filter(f => f.endsWith('.stories.ts'))
const text = (f: string) => readFileSync(join(DIR, f), 'utf8')

describe('the story catalogue', () => {
  it('has a story file for every presentational component', () => {
    for (const c of ['DashboardHeader', 'WidgetFrame', 'StatsBar', 'CalendarLegend', 'CalendarGrid', 'WeekTooltip', 'StatePanel', 'AppButton', 'GridSkeleton', 'LifeCalendarView']) {
      expect(stories, c).toContain(`${c}.stories.ts`)
    }
  })
  it('the widget has one story per state, named so the ids are stable', () => {
    const t = text('LifeCalendarView.stories.ts')
    for (const name of ['Loaded', 'Loading', 'ApiError', 'KeyUnavailable', 'Empty', 'BeforeBirth', 'PastNinetyYears']) expect(t, name).toMatch(new RegExp(`export const ${name}\\b`))
  })
  it('no story fetches, and the only data source is the fake fixtures', () => {
    for (const f of stories) {
      const t = text(f)
      expect(t, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|https?:\/\//)
      for (const m of t.matchAll(/from '([^']+)'/g)) expect(m[1], `${f} imports ${m[1]}`).not.toMatch(/nexus-api|profile|\.private/)
    }
  })
})
```

Add `'tests/unit/**/*.test.ts'` to the Vitest `include` if not there. Run `pnpm --filter @digismith/nexus-web test` → FAIL (no stories).

- [ ] **Step 3: Storybook config**

`scripts/nexus-web/.storybook/main.ts`:

```ts
import type { StorybookConfig } from '@storybook-vue/nuxt'

const config: StorybookConfig = {
  stories: ['../app/**/*.stories.ts'],
  addons: ['@storybook/addon-a11y'],   // the panel for Jack; the failing gate is the axe run in Playwright (task 16)
  framework: { name: '@storybook-vue/nuxt', options: {} },
  core: { disableTelemetry: true },
}
export default config
```

`scripts/nexus-web/.storybook/preview.ts`:

```ts
import '../app/assets/main.scss'

export default {
  globalTypes: {
    theme: { description: 'Colour scheme', toolbar: { title: 'Theme', dynamicTitle: true, items: [{ value: 'device', title: 'Device' }, { value: 'light', title: 'Light' }, { value: 'dark', title: 'Dark' }] } },
  },
  initialGlobals: { theme: 'device' },
  decorators: [
    // the toolbar item sets data-theme so Jack can compare both schemes on one device; the tests use browser emulation instead
    (story: () => unknown, ctx: { globals: { theme?: string } }) => {
      const t = ctx.globals.theme
      if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t
      else delete document.documentElement.dataset.theme
      return story()
    },
    // no story may reach the API or anything else
    (story: () => unknown) => {
      window.fetch = (() => { throw new Error('stories must not fetch') }) as typeof fetch
      return story()
    },
  ],
  parameters: { layout: 'padded', a11y: { test: 'error' } },
}
```

(If Storybook 10's Vue renderer needs a component from a decorator, return `{ components: { story: story() }, template: '<story />' }` as in the Storybook Vue decorator docs.)

- [ ] **Step 4: The stories**

`WeekTooltip.vue`: add an `inline?: boolean` prop; when true add the class `inline` with `position: static; animation: none`. The stories use it so the tooltip shows in the page flow. (Add a one-line test in `interaction.test.ts`: `inline` removes the fixed position class.)

`app/components/LifeCalendarView.stories.ts`:

```ts
import { BEFORE_BIRTH, fixture, PAST_LAST_ROW } from '../../tests/fixtures'
import LifeCalendarView from './LifeCalendarView.vue'

const meta = { title: 'Widget/Life Calendar', component: LifeCalendarView, args: { retrying: false } }
export default meta

export const Loaded = { args: { state: { kind: 'loaded', data: fixture() } } }
export const Loading = { args: { state: { kind: 'loading' } } }
export const ApiError = { args: { state: { kind: 'error' } } }
export const KeyUnavailable = { args: { state: { kind: 'locked' } } }
export const Empty = { args: { state: { kind: 'empty' } } }
export const BeforeBirth = { args: { state: { kind: 'loaded', data: BEFORE_BIRTH() } } }
export const PastNinetyYears = { args: { state: { kind: 'loaded', data: PAST_LAST_ROW() } } }
```

The other story files follow the same plain pattern (a `meta` default export with `title` and `component`, and named story exports with `args`):

- `StatePanel.stories.ts`: title `Components/State panel`; `Error`→ export `ErrorPanel` (`kind: 'error'`), `LockedPanel`, `EmptyPanel`, `RetryingPanel` (`kind: 'error', retrying: true`); all with `retrying: false` default.
- `StatsBar.stories.ts`: `Values` (`totals: fixture().totals`), `Loading` (`totals: null, loading: true`), `Dashes` (`totals: null, loading: false`), `BeforeBirth`, `PastNinetyYears`.
- `CalendarLegend.stories.ts`: one `Default` story.
- `CalendarGrid.stories.ts`: `FullGrid` (`data: fixture()`), `SmallGrid` (`data: fixture('1992-06-15', { birthDate: '1990-01-01', lifeYears: 3 })`: three rows showing all three states; the fixture takes a profile argument).
- `WeekTooltip.stories.ts`: `Lived`, `ThisWeek`, `Ahead` (`mode: 'pointer', inline: true`), `TouchReadout` (`mode: 'readout', inline: true`), each with an `info` from the fake dates.
- `AppButton.stories.ts`: `Default`, `Busy` (`busy: true, busyLabel: 'Retrying…'`), with `render` that passes the slot text.
- `GridSkeleton.stories.ts`: `Pulse` (`rows: 90, ghost: false`), `Ghost` (`ghost: true`).
- `WidgetFrame.stories.ts`: `WithMetaAndNote`.
- `DashboardHeader.stories.ts`: `Default`.

Every story file imports only its component and `../../tests/fixtures`.

- [ ] **Step 5: Run the catalogue test, then build and look at Storybook**

Run: `pnpm --filter @digismith/nexus-web test` → PASS.
Run: `pnpm --filter @digismith/nexus-web build-storybook` → expect `scripts/nexus-web/storybook-static/index.html`, `iframe.html` and `index.json`. Check `node -e "const j=require('./scripts/nexus-web/storybook-static/index.json'); console.log(Object.keys(j.entries).filter(k=>k.startsWith('widget-life-calendar')).sort().join('\n'))"` lists the seven widget ids. If an id differs from the list in Interfaces, rename the export so the ids match (tasks 16 and 17 use these ids).
Run: `pnpm --filter @digismith/nexus-web storybook` once, open the printed URL, and look at the seven widget stories in the device scheme and with the Theme toolbar set to dark.

- [ ] **Step 6: Commit**

```bash
git add -- scripts/nexus-web pnpm-lock.yaml
git commit -m "feat(dgs-481): add Storybook with one story per state" -- scripts/nexus-web pnpm-lock.yaml
```

---

### Task 15: End-to-end tests with a stub API

**Files:**
- Create: `scripts/nexus-web/playwright.config.ts`, `scripts/nexus-web/tests/e2e/stub-server.ts`, `scripts/nexus-web/tests/e2e/serve-stub-cli.ts`, `scripts/nexus-web/tests/e2e/fixtures.ts`, `scripts/nexus-web/tests/e2e/dashboard.spec.ts`, `scripts/nexus-web/tests/e2e/states.spec.ts`, `scripts/nexus-web/tests/e2e/keyboard-touch.spec.ts`
- Modify: `scripts/nexus-web/package.json`

**Interfaces:**
- Produces: `startStub({ dir, port? }): Promise<{ url: string; setMode(mode: Mode): Promise<void>; close(): Promise<void> }>` with `type Mode = 'ok' | 'before' | 'past' | 'locked' | 'empty' | 'down'`; the Playwright fixtures `test` and `expect` (with a worker-scoped `stub`); projects `desktop` (1000x900) and `phone` (390x844, touch); scripts `e2e`, `e2e:install`.

- [ ] **Step 1: Add the dependency and download Chromium (allowed in the build order)**

Add `"@playwright/test": "1.64.1"` to `devDependencies`; scripts `"e2e": "nuxt generate && playwright test tests/e2e"` and `"e2e:install": "playwright install chromium"`. Run `pnpm install` then `pnpm --filter @digismith/nexus-web e2e:install`.

- [ ] **Step 2: Write the stub server and the config**

`scripts/nexus-web/tests/e2e/stub-server.ts` (the stub uses the real Hono app with a fake profile loader and a fixed clock, so the end-to-end test exercises the real route):

```ts
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, normalize } from 'node:path'
import { getRequestListener } from '@hono/node-server'
import { buildApp } from '../../../nexus-api/src/app.ts'
import type { Profile } from '../../../nexus-api/src/profile-crypto.ts'

export type Mode = 'ok' | 'before' | 'past' | 'locked' | 'empty' | 'down'
const NOW = Date.parse('2026-10-16T14:00:00Z')   // 21:00 on 2026-10-16 in UTC+7
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' }
// fake profiles only: no real date is ever in a test
const LOADERS: Record<Mode, () => Promise<Profile>> = {
  ok: async () => ({ birthDate: '1990-01-01', lifeYears: 90 }),
  before: async () => ({ birthDate: '2030-01-01', lifeYears: 90 }),
  past: async () => ({ birthDate: '1900-01-01', lifeYears: 90 }),
  locked: async () => { throw { code: 'key_unavailable' } },
  empty: async () => { throw { code: 'profile_missing' } },
  down: async () => { throw new Error('boom') },
}

export async function startStub(opts: { dir: string; port?: number }) {
  let mode: Mode = 'ok'
  const app = buildApp(async () => null, { loadProfile: () => LOADERS[mode](), now: () => NOW })
  const api = getRequestListener(app.fetch)
  const server = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0]
    if (url.startsWith('/__stub/')) { mode = url.slice('/__stub/'.length) as Mode; res.end('ok'); return }
    if (url.startsWith('/api/')) { api(req, res); return }
    let file = join(opts.dir, normalize(url).replace(/^(\.\.[/\\])+/, ''))
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
    if (!existsSync(file)) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
    createReadStream(file).pipe(res)
  })
  await new Promise<void>(r => server.listen(opts.port ?? 0, '127.0.0.1', r))
  const port = (server.address() as AddressInfo).port
  return {
    url: `http://127.0.0.1:${port}`,
    async setMode(m: Mode) { await fetch(`http://127.0.0.1:${port}/__stub/${m}`) },
    async close() { await new Promise(r => server.close(r)) },
  }
}
```

`scripts/nexus-web/tests/e2e/serve-stub-cli.ts` (used by Lighthouse CI in task 18):

```ts
import { join } from 'node:path'
import { startStub } from './stub-server.ts'

const s = await startStub({ dir: join(import.meta.dirname, '../../.output/public'), port: Number(process.env.STUB_PORT ?? 4390) })
console.log(`stub listening ${s.url}`)
```

`scripts/nexus-web/tests/e2e/fixtures.ts`:

```ts
import { test as base, expect } from '@playwright/test'
import { join } from 'node:path'
import { startStub } from './stub-server.ts'

type Stub = Awaited<ReturnType<typeof startStub>>
export const PAGE_DIR = join(import.meta.dirname, '../../.output/public')

export const test = base.extend<{ app: Stub }, { stub: Stub }>({
  stub: [async ({}, use) => { const s = await startStub({ dir: PAGE_DIR }); await use(s); await s.close() }, { scope: 'worker' }],
  app: async ({ stub, page }, use) => {
    await stub.setMode('ok')
    await page.clock.install({ time: new Date('2026-10-16T14:00:00Z') })   // the browser clock matches the stub clock
    await use(stub)
  },
})
export { expect }
```

`scripts/nexus-web/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: ['e2e/**/*.spec.ts', 'a11y/**/*.spec.ts', 'visual/**/*.spec.ts', 'perf/**/*.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [['list']],
  // Baselines have no platform suffix on purpose: they are made and checked on the Workbox, with this pinned Playwright version.
  snapshotPathTemplate: '{testDir}/visual/__screenshots__/{arg}{ext}',
  expect: { toHaveScreenshot: { animations: 'disabled', maxDiffPixelRatio: 0.001 } },
  use: { reducedMotion: 'reduce', timezoneId: 'Asia/Ho_Chi_Minh', locale: 'en-US', trace: 'off' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1000, height: 900 } } },
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
})
```

- [ ] **Step 3: Write the specs**

`scripts/nexus-web/tests/e2e/dashboard.spec.ts`:

```ts
import { expect, test } from './fixtures'

test.describe('the dashboard against the stub API (fake profile)', () => {
  test('draws 90 rows of 52 boxes with the right states and numbers', async ({ app, page }) => {
    await page.goto(app.url)
    await expect(page.getByRole('heading', { level: 2, name: 'Life Calendar' })).toBeVisible()
    await expect(page.locator('[role="gridcell"]')).toHaveCount(4680)
    await expect(page.locator('[role="rowheader"]')).toHaveCount(90)
    await expect(page.locator('[data-state="lived"]')).toHaveCount(1913)
    await expect(page.locator('[data-state="current"]')).toHaveCount(1)
    await expect(page.locator('[data-state="ahead"]')).toHaveCount(2766)
    await expect(page.locator('dd')).toHaveText(['1,913', '2,766', '40.9%'])
    await expect(page.locator('dt')).toHaveText(['weeks lived', 'weeks left', 'lived'])
    await expect(page.getByText('Updated 21:00, UTC+7')).toBeVisible()
    await expect(page.locator('.date')).toHaveText('Friday 16 October 2026')
  })
  test('the tooltip shows age, week, dates and state on hover', async ({ app, page }) => {
    await page.goto(app.url)
    await page.locator('[data-row="36"][data-box="41"]').hover()
    const tip = page.getByRole('tooltip')
    await expect(tip).toContainText('Age 36 · Week 42 of 52')
    await expect(tip).toContainText('15 Oct 2026 – 21 Oct 2026')
    await expect(tip).toContainText('This week')
  })
  test('dark mode follows the device', async ({ app, page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto(app.url)
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(10, 10, 10)')
    await expect(page.locator('[data-state="current"]')).toHaveCSS('background-color', 'rgb(255, 90, 60)')
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  })
  test('no horizontal scroll at 320 px', async ({ app, page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await page.goto(app.url)
    await expect(page.locator('[role="gridcell"]')).toHaveCount(4680)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
  test('the page talks to the stub API only, and only for the life calendar', async ({ app, page }) => {
    const seen: string[] = []
    page.on('request', r => seen.push(r.url()))
    await page.goto(app.url)
    await expect(page.locator('[role="gridcell"]')).toHaveCount(4680)
    expect(seen.every(u => u.startsWith(app.url))).toBe(true)
    expect(seen.filter(u => u.includes('/api/')).map(u => new URL(u).pathname)).toEqual(['/api/v1/life-calendar'])
  })
  test('it asks again at the UTC+7 midnight', async ({ app, page }) => {
    let calls = 0
    page.on('request', r => { if (r.url().includes('/api/v1/life-calendar')) calls++ })
    await page.goto(app.url)
    await expect(page.locator('[role="gridcell"]')).toHaveCount(4680)
    expect(calls).toBe(1)
    await page.clock.fastForward('03:10:00')   // 21:00 + 3 h 10 min passes 00:00 in UTC+7
    await expect.poll(() => calls).toBeGreaterThanOrEqual(2)
  })
  test('before birth and past the last row use the normal layout with no this-week box', async ({ app, page }) => {
    for (const [mode, dd] of [['before', ['0', '4,680', '0.0%']], ['past', ['4,680', '0', '100.0%']]] as const) {
      await app.setMode(mode)
      await page.goto(app.url)
      await expect(page.locator('[role="gridcell"]')).toHaveCount(4680)
      await expect(page.locator('[data-state="current"]')).toHaveCount(0)
      await expect(page.locator('dd')).toHaveText([...dd])
    }
  })
})
```

`scripts/nexus-web/tests/e2e/states.spec.ts`:

```ts
import { expect, test } from './fixtures'

test.describe('error states', () => {
  for (const [mode, role, title] of [['locked', 'alert', 'The calendar is locked.'], ['empty', 'status', 'No calendar yet.'], ['down', 'alert', 'The calendar is not available right now.']] as const) {
    test(`${mode}: a panel over the ghost grid, dashes in the stats, the frame stays`, async ({ app, page }) => {
      await app.setMode(mode)
      await page.goto(app.url)
      const panel = page.locator('.panel')
      await expect(panel).toBeVisible()
      await expect(panel).toHaveAttribute('role', role)
      await expect(panel).toContainText(title)
      await expect(page.locator('dd')).toHaveText(['–', '–', '–'])
      await expect(page.getByRole('heading', { level: 2, name: 'Life Calendar' })).toBeVisible()
      await expect(page.locator('[role="gridcell"]')).toHaveCount(0)
    })
  }
  test('Retry recovers when the server recovers, and moves focus to the grid', async ({ app, page }) => {
    await app.setMode('locked')
    await page.goto(app.url)
    await expect(page.locator('.panel')).toBeVisible()
    await app.setMode('ok')
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(page.locator('[role="gridcell"]')).toHaveCount(4680)
    await expect(page.locator('.panel')).toHaveCount(0)
    await expect(page.locator('[data-row="36"][data-box="41"]')).toBeFocused()
  })
  test('Retry keeps the panel when it fails again', async ({ app, page }) => {
    await app.setMode('down')
    await page.goto(app.url)
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(page.locator('.panel')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry' })).toBeEnabled()
  })
})
```

`scripts/nexus-web/tests/e2e/keyboard-touch.spec.ts`:

```ts
import { expect, test } from './fixtures'

test.describe('keyboard', () => {
  test.skip(({ isMobile }) => isMobile, 'keyboard runs on the desktop project')
  test('Tab reaches the skip link, then the one grid tab stop on this week', async ({ app, page }) => {
    await page.goto(app.url)
    await expect(page.locator('[data-row="36"][data-box="41"]')).toBeAttached()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to the calendar' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.locator('[data-row="36"][data-box="41"]')).toBeFocused()
    await expect(page.getByRole('tooltip')).toContainText('Age 36 · Week 42 of 52')
  })
  test('the Designer keys move focus, and the tooltip follows', async ({ app, page }) => {
    await page.goto(app.url)
    await page.locator('[data-row="36"][data-box="41"]').focus()
    const at = (r: number, b: number) => expect(page.locator(`[data-row="${r}"][data-box="${b}"]`)).toBeFocused()
    await page.keyboard.press('ArrowRight'); await at(36, 42)
    await page.keyboard.press('ArrowDown'); await at(37, 42)
    await page.keyboard.press('Home'); await at(37, 0)
    await page.keyboard.press('End'); await at(37, 51)
    await page.keyboard.press('PageUp'); await at(27, 51)
    await page.keyboard.press('Control+Home'); await at(0, 0)
    await page.keyboard.press('Control+End'); await at(89, 51)
    await expect(page.getByRole('tooltip')).toContainText('Age 89 · Week 52 of 52')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('tooltip')).toHaveCount(0)
    expect(await page.locator('[role="gridcell"][tabindex="0"]').count()).toBe(1)
  })
  test('hover with a mouse shows the tooltip for the box under the pointer', async ({ app, page }) => {
    await page.goto(app.url)
    await page.locator('[data-row="10"][data-box="5"]').hover()
    await expect(page.getByRole('tooltip')).toContainText('Age 10 · Week 6 of 52')
  })
})

test.describe('touch', () => {
  test.skip(({ isMobile }) => !isMobile, 'touch runs on the phone project')
  test('a tap near a box selects the nearest box and shows the readout at the bottom', async ({ app, page }) => {
    await page.goto(app.url)
    const box = await page.locator('[data-row="36"][data-box="41"]').boundingBox()
    await page.touchscreen.tap(box!.x + box!.width / 2 + 4, box!.y + box!.height / 2 + 4)   // beside the box, inside the 14 px radius
    const readout = page.getByRole('status').filter({ hasText: 'Age 36' })
    await expect(readout).toContainText('Week 42 of 52')
    const r = await readout.boundingBox()
    expect(r!.y + r!.height).toBeGreaterThan(844 - 40)   // pinned to the bottom of the screen
    await page.touchscreen.tap(5, 5)   // outside the grid clears it
    await expect(readout).toHaveCount(0)
  })
})
```

- [ ] **Step 4: Run, fix, run again**

Run: `pnpm --filter @digismith/nexus-web e2e`
Expected: all PASS on both projects. The first run is where selectors meet the real DOM: fix a test only when the page is right and the test is wrong; fix the page when the Designer's text or behaviour is violated (and tell the Maestro what changed).

- [ ] **Step 5: Commit**

```bash
git add -- scripts/nexus-web pnpm-lock.yaml
git commit -m "test(dgs-481): add end-to-end tests against a stub API" -- scripts/nexus-web pnpm-lock.yaml
```

---

### Task 16: Accessibility checks

**Files:**
- Create: `scripts/nexus-web/tests/a11y/axe.spec.ts`, `scripts/nexus-web/tests/a11y/stories-axe.spec.ts`, `scripts/nexus-web/tests/a11y/static-server.ts`, `scripts/nexus-web/tests/unit/contrast.test.ts`, `scripts/nexus-web/tests/a11y/EXCEPTIONS.md`
- Modify: `scripts/nexus-web/package.json`

**Interfaces:**
- Consumes: `startStub`, `test` (task 15); the story ids (task 14).
- Produces: `startStatic(dir): Promise<{ url; close }>` (a plain static server, reused by task 17); scripts `a11y` (`playwright test tests/a11y`).

- [ ] **Step 1: Add the dependencies**

Add `"@axe-core/playwright": "4.14.0"` and `"axe-core": "4.14.0"` to `devDependencies`; script `"a11y": "nuxt generate && playwright test tests/a11y"`. Run `pnpm install`.

- [ ] **Step 2: The contrast test (no browser)**

`scripts/nexus-web/tests/unit/contrast.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const scss = readFileSync(join(__dirname, '../../app/assets/main.scss'), 'utf8')
function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map(m => [m[1], m[2]]))
}
const light = tokens(scss.slice(scss.indexOf(':root {'), scss.indexOf('@media (min-width')))
const dark = tokens(scss.slice(scss.indexOf('@media (prefers-color-scheme: dark)'), scss.indexOf(':root[data-theme=\'dark\']')))
const lum = (hex: string) => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

describe.each([['light', light], ['dark', dark]] as const)('contrast in %s (WCAG 2.2 AA)', (_name, t) => {
  it('has all the tokens', () => { for (const k of ['bg', 'ink', 'ink-2', 'line', 'ahead', 'accent', 'accent-text']) expect(t[k], k).toBeDefined() })
  it('text is at least 4.5:1 on the page', () => {
    for (const k of ['ink', 'ink-2', 'accent-text']) expect(ratio(t[k], t.bg), `${k} on bg`).toBeGreaterThanOrEqual(4.5)
  })
  it('the ahead outline and the this-week box are at least 3:1 on the page (non-text)', () => {
    for (const k of ['ahead', 'accent']) expect(ratio(t[k], t.bg), `${k} on bg`).toBeGreaterThanOrEqual(3)
  })
  it('a lived box (ink) and this week (accent) are told apart by more than colour: ratio between them is above 1.5 as a second guard', () => {
    expect(ratio(t.ink, t.accent)).toBeGreaterThanOrEqual(1.5)
  })
})
```

Run: `pnpm --filter @digismith/nexus-web test` → PASS. If the vermilion accent fails its 3:1 in either scheme, **do not change the colour**: tell the Maestro (the accent is pending Jack).

- [ ] **Step 3: The axe specs (the failing gate)**

`scripts/nexus-web/tests/a11y/EXCEPTIONS.md` (the only allowed exceptions, each with a reason; Jack signs them off):

```md
# Accessibility exceptions (DGS-481)

1. **WCAG 2.5.8 Target Size (Minimum), only on the grid boxes** (`#calendar-grid [role="gridcell"]`).
   Reason: "essential" exception. A life in weeks is 4,680 boxes that must fit one screen; the boxes are 4 to 15 px. Keyboard navigation (one tab stop, arrow keys, Home, End, Page Up, Page Down) and the touch nearest-box rule (14 px radius) give every box a usable way in. The 44 px buttons meet the rule.
2. **WCAG 1.4.13 Content on Hover or Focus: "hoverable"** for the tooltip. axe does not test it.
   Reason: the tooltip is non-interactive by the Designer's decision (it follows the pointer and never takes pointer events). It is dismissible (Escape) and persistent. All its text is also the box's accessible name, so no information is available only on hover.

Both need Jack's sign-off (ticket: "Screen-reader pass and accessibility sign-off").
```

`scripts/nexus-web/tests/a11y/axe.spec.ts`:

```ts
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from '../e2e/fixtures'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

// Everything, with ONE exception recorded in EXCEPTIONS.md: target size on the grid boxes (run separately, below).
async function violations(page: Page) {
  const all = await new AxeBuilder({ page }).withTags(TAGS).disableRules(['target-size']).analyze()
  const size = await new AxeBuilder({ page }).withRules(['target-size']).exclude('#calendar-grid [role="gridcell"]').analyze()
  return [...all.violations, ...size.violations].map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)
}

for (const scheme of ['light', 'dark'] as const) {
  for (const mode of ['ok', 'before', 'past', 'locked', 'empty', 'down'] as const) {
    test(`no axe violations: ${mode}, ${scheme}`, async ({ app, page }) => {
      await app.setMode(mode)
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto(app.url)
      if (mode === 'locked' || mode === 'empty' || mode === 'down') await expect(page.locator('.panel')).toBeVisible()
      else await expect(page.locator('[role="gridcell"]')).toHaveCount(4680)
      expect(await violations(page)).toEqual([])
    })
  }
  test(`no axe violations with the tooltip open (keyboard), ${scheme}`, async ({ app, page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto(app.url)
    await page.locator('[data-row="36"][data-box="41"]').focus()
    await expect(page.getByRole('tooltip')).toBeVisible()
    expect(await violations(page)).toEqual([])
  })
}
```

`scripts/nexus-web/tests/a11y/static-server.ts` (plain files only; used for Storybook):

```ts
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, normalize } from 'node:path'

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.map': 'application/json' }
export async function startStatic(dir: string) {
  const server = createServer((req, res) => {
    let file = join(dir, normalize((req.url ?? '/').split('?')[0]).replace(/^(\.\.[/\\])+/, ''))
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
    if (!existsSync(file)) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
    createReadStream(file).pipe(res)
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => new Promise<void>(r => server.close(() => r())) }
}
```

`scripts/nexus-web/tests/a11y/stories-axe.spec.ts` (every story of the built Storybook, both schemes; this is the failing gate that the Storybook a11y addon panel mirrors):

```ts
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { startStatic } from './static-server.ts'

const DIR = join(import.meta.dirname, '../../storybook-static')
const entries = Object.values(JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8')).entries as Record<string, { id: string; type: string }>).filter(e => e.type === 'story')
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

let url = ''; let close: () => Promise<void>
test.beforeAll(async () => { ({ url, close } = await startStatic(DIR)) })
test.afterAll(async () => { await close() })

for (const scheme of ['light', 'dark'] as const) {
  for (const e of entries) {
    test(`axe: ${e.id}, ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto(`${url}/iframe.html?id=${e.id}&viewMode=story`)
      await page.locator('#storybook-root > *').first().waitFor()
      // target-size on the grid boxes is the one recorded exception (tests/a11y/EXCEPTIONS.md)
      const all = await new AxeBuilder({ page }).include('#storybook-root').withTags(TAGS).disableRules(['target-size', 'region']).analyze()
      const size = await new AxeBuilder({ page }).include('#storybook-root').withRules(['target-size']).exclude('[role="gridcell"]').analyze()
      expect([...all.violations, ...size.violations].map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
    })
  }
}
```

(`region` is disabled for stories only: an isolated component in a story iframe has no landmarks by design; the full page run above keeps `region` on.)

- [ ] **Step 4: Run**

Run: `pnpm --filter @digismith/nexus-web build-storybook && pnpm --filter @digismith/nexus-web a11y`
Expected: PASS. A violation is a real defect: fix the component (names, roles, contrast, labels), never the test. The fix of a **colour** violation is Jack's call: stop and tell the Maestro. The specs run on both Playwright projects (desktop and phone), so each scheme and state is checked at both widths.

- [ ] **Step 5: Commit**

```bash
git add -- scripts/nexus-web pnpm-lock.yaml
git commit -m "test(dgs-481): fail the build on any accessibility violation" -- scripts/nexus-web pnpm-lock.yaml
```

---

### Task 17: Visual regression baselines

**Files:**
- Create: `scripts/nexus-web/tests/visual/stories.spec.ts`, `scripts/nexus-web/tests/visual/__screenshots__/*.png` (generated)
- Modify: `scripts/nexus-web/package.json`

**Interfaces:**
- Consumes: `startStatic` (task 16); the story ids (task 14).
- Produces: committed baselines named `<story-id>-<scheme>-<project>.png`; scripts `visual` (`playwright test tests/visual`) and `visual:update` (`playwright test tests/visual --update-snapshots`).

- [ ] **Step 1: Write the spec**

`scripts/nexus-web/tests/visual/stories.spec.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { startStatic } from '../a11y/static-server.ts'

const DIR = join(import.meta.dirname, '../../storybook-static')
const entries = Object.values(JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8')).entries as Record<string, { id: string; type: string }>).filter(e => e.type === 'story')
let url = ''; let close: () => Promise<void>
test.beforeAll(async () => { ({ url, close } = await startStatic(DIR)) })
test.afterAll(async () => { await close() })

for (const scheme of ['light', 'dark'] as const) {
  for (const e of entries) {
    test(`${e.id} ${scheme}`, async ({ page }, info) => {
      // The seven widget states are checked at both widths. Every other story at the desktop width only.
      test.skip(info.project.name === 'phone' && !e.id.startsWith('widget-life-calendar--'), 'phone width: widget states only')
      await page.clock.install({ time: new Date('2026-10-16T14:00:00Z') })   // fixed clock: the header date is stable
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await page.goto(`${url}/iframe.html?id=${e.id}&viewMode=story`)
      await page.locator('#storybook-root > *').first().waitFor()
      await page.evaluate(() => document.fonts.ready)
      await expect(page).toHaveScreenshot(`${e.id}-${scheme}-${info.project.name}.png`, { fullPage: true })
    })
  }
}
```

Add scripts `"visual": "playwright test tests/visual"` and `"visual:update": "playwright test tests/visual --update-snapshots"`.

- [ ] **Step 2: Make the baselines**

Run: `pnpm --filter @digismith/nexus-web build-storybook && pnpm --filter @digismith/nexus-web visual:update`
Expected: PNG files appear under `tests/visual/__screenshots__/` (about 7 widget states x 2 schemes x 2 widths plus the other stories x 2 schemes x 1 width). Open the seven widget baselines for both schemes and look at them against `mock.html`: the grid, the stats, the legend, the panels. Do not commit a baseline that looks wrong; fix the component first.

- [ ] **Step 3: Run the check twice to prove it is stable**

Run: `pnpm --filter @digismith/nexus-web visual` twice in a row. Expected: PASS both times, with no diff. If a story flickers (a font, a clock, an animation), fix the cause (`animations: 'disabled'`, the fixed clock, `reducedMotion`) and rerun; never raise `maxDiffPixelRatio` above `0.001` without telling the Maestro.

- [ ] **Step 4: Commit**

```bash
git add -- scripts/nexus-web/tests/visual scripts/nexus-web/package.json
git commit -m "test(dgs-481): add visual regression baselines for every story" -- scripts/nexus-web/tests/visual scripts/nexus-web/package.json
```

---

### Task 18: Core Web Vitals budgets

**Files:**
- Create: `scripts/nexus-web/tests/perf/vitals.spec.ts`, `scripts/nexus-web/tests/perf/chrome-path.mjs`, `scripts/nexus-web/lighthouserc.mobile.cjs`, `scripts/nexus-web/lighthouserc.desktop.cjs`
- Modify: `scripts/nexus-web/app/components/CalendarGrid.vue` (two timing marks), `scripts/nexus-web/package.json`

**Interfaces:**
- Consumes: `startStub`/`serve-stub-cli.ts`, the Playwright `test` fixtures (task 15).
- Produces: scripts `perf` (`playwright test tests/perf`) and `lhci` (Lighthouse CI, mobile and desktop). Budgets: LCP under 2,500 ms, INP under 200 ms, CLS under 0.1.

- [ ] **Step 1: Add the dependencies and confirm the web-vitals build file**

Add `"web-vitals": "6.2.3"` and `"@lhci/cli": "0.15.1"` to `devDependencies`; scripts:
`"perf": "nuxt generate && playwright test tests/perf"`,
`"lhci": "nuxt generate && CHROME_PATH=$(node tests/perf/chrome-path.mjs) lhci autorun --config=lighthouserc.mobile.cjs && CHROME_PATH=$(node tests/perf/chrome-path.mjs) lhci autorun --config=lighthouserc.desktop.cjs"`.
Run `pnpm install`, then `ls scripts/nexus-web/node_modules/web-vitals/dist`. Expected: it lists `web-vitals.iife.js`. If the file has another name in 6.2.3, use that one in the spec below.

- [ ] **Step 2: Add the render timing marks**

In `CalendarGrid.vue` `<script setup>` add as the first line `if (typeof performance !== 'undefined') performance.mark('grid-setup')` and `onMounted(() => performance.measure('grid-render', 'grid-setup'))`.

- [ ] **Step 3: Write the Playwright vitals test**

`scripts/nexus-web/tests/perf/vitals.spec.ts`:

```ts
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { expect, test } from '../e2e/fixtures'

const require = createRequire(import.meta.url)
const IIFE = readFileSync(require.resolve('web-vitals/dist/web-vitals.iife.js'), 'utf8')
const BUDGET = { lcp: 2500, inp: 200, cls: 0.1 }
// A starting guard for the grid's own render task. The first real measure may justify moving it: tell the Maestro when you do.
const RENDER_GUARD = { desktop: 100, phone: 400 }

test('Core Web Vitals stay inside the "good" budgets (local, no analytics)', async ({ app, page, browserName }, info) => {
  const phone = info.project.name === 'phone'
  await page.addInitScript({ content: `${IIFE};
    window.__v = { worst: 0 };
    for (const n of ['onLCP', 'onCLS', 'onINP']) webVitals[n](m => { window.__v[m.name] = m.value }, { reportAllChanges: true });
    new PerformanceObserver(l => l.getEntries().forEach(e => { if (e.interactionId) window.__v.worst = Math.max(window.__v.worst, e.duration) })).observe({ type: 'event', durationThreshold: 16, buffered: true });` })
  if (phone) await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: 4 })

  await page.goto(app.url)
  await expect(page.locator('[role="gridcell"]')).toHaveCount(4680)
  await page.waitForTimeout(1500)

  // scripted interaction: pointer sweeps, clicks, taps and keys
  if (phone) {
    const box = await page.locator('[data-row="20"][data-box="20"]').boundingBox()
    for (let i = 0; i < 12; i++) await page.touchscreen.tap(box!.x + (i % 6), box!.y + i)
  } else {
    const start = await page.locator('[data-row="0"][data-box="0"]').boundingBox()
    await page.mouse.move(start!.x, start!.y)
    for (let i = 0; i < 300; i++) await page.mouse.move(start!.x + (i % 52) * 15, start!.y + Math.floor(i / 52) * 15, { steps: 2 })
    await page.locator('[data-row="36"][data-box="41"]').focus()
    for (let i = 0; i < 40; i++) await page.keyboard.press(i % 7 === 0 ? 'ArrowDown' : 'ArrowRight')
    await page.keyboard.press('PageDown'); await page.keyboard.press('Escape')
  }
  await page.waitForTimeout(500)

  const v = await page.evaluate(() => ({ ...(window as any).__v, render: performance.getEntriesByName('grid-render')[0]?.duration ?? null }))
  expect(v.LCP, 'LCP was measured').toBeGreaterThan(0)
  expect(v.LCP).toBeLessThan(BUDGET.lcp)
  expect(v.CLS ?? 0).toBeLessThan(BUDGET.cls)
  expect(v.INP ?? v.worst).toBeLessThan(BUDGET.inp)   // INP only reports interactions over 40 ms; the observer catches the worst one from 16 ms
  expect(v.render, 'the grid render was timed').not.toBeNull()
  expect(v.render).toBeLessThan(phone ? RENDER_GUARD.phone : RENDER_GUARD.desktop)
  test.info().annotations.push({ type: 'vitals', description: JSON.stringify({ LCP: Math.round(v.LCP), CLS: v.CLS ?? 0, INP: v.INP ?? v.worst, render: Math.round(v.render) }) })
})
```

(The numbers are printed as a test annotation only; they come from the fake profile, not from anything private.)

- [ ] **Step 4: Lighthouse CI configs**

`scripts/nexus-web/tests/perf/chrome-path.mjs`:

```js
import { chromium } from '@playwright/test'
console.log(chromium.executablePath())
```

`scripts/nexus-web/lighthouserc.mobile.cjs`:

```js
module.exports = {
  ci: {
    collect: {
      startServerCommand: 'node --experimental-strip-types tests/e2e/serve-stub-cli.ts',
      startServerReadyPattern: 'stub listening',
      url: ['http://127.0.0.1:4390/'],
      numberOfRuns: 3,
      settings: { onlyCategories: ['performance'], chromeFlags: '--no-sandbox --headless=new' },   // Lighthouse's default mobile profile (slow 4G, 4x CPU)
    },
    assert: {
      assertions: {
        'largest-contentful-paint': ['error', { maxNumericValue: 2500, aggregationMethod: 'median' }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1, aggregationMethod: 'median' }],
        // Lighthouse's navigation run has no INP; Total Blocking Time is the lab stand-in. The real INP is in tests/perf/vitals.spec.ts.
        'total-blocking-time': ['error', { maxNumericValue: 200, aggregationMethod: 'median' }],
      },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci/mobile' },   // local files only: nothing is uploaded anywhere
  },
}
```

`scripts/nexus-web/lighthouserc.desktop.cjs`: the same file with `settings: { preset: 'desktop', onlyCategories: ['performance'], chromeFlags: '--no-sandbox --headless=new' }` and `outputDir: '.lighthouseci/desktop'`.

- [ ] **Step 5: Run**

Run: `pnpm --filter @digismith/nexus-web perf` → PASS on both projects.
Run: `pnpm --filter @digismith/nexus-web lhci` → PASS for both profiles (it starts the stub server, runs Lighthouse three times per profile, asserts the medians).
If a budget fails, fix the page in this order and rerun: (1) layout shift: the skeleton and the grid heights differ (task 11 geometry), or something reserved no space; (2) render time: the fallbacks in spec section 13 (labels on first hover or focus; decade chunks with `requestIdleCallback`); (3) tooltip work per move. Never raise a budget; Jack's thresholds are Google's "good".

- [ ] **Step 6: Commit**

```bash
git add -- scripts/nexus-web pnpm-lock.yaml
git commit -m "test(dgs-481): enforce Core Web Vitals budgets locally" -- scripts/nexus-web pnpm-lock.yaml
```

---

### Task 19: The Keychain provider and its probe (a later ticket: needs Jack)

**Files:**
- Create: `scripts/nexus-api/probe-keychain.ts`, `scripts/nexus-api/probe-keychain.test.ts`, `scripts/nexus-api/com.jazurite.digismith.nexus-keychain-probe.plist.tmpl`, `scripts/nexus-api/store-key-in-keychain.ts`
- Modify: `scripts/nexus-api/src/key-provider.ts`, `scripts/nexus-api/src/key-provider.test.ts`, `scripts/nexus-api/nexus-api.sh.tmpl`, `scripts/nexus-api/install.sh`, `scripts/nexus-api/test-install.test.ts`

**Interfaces:**
- Produces: `keychainKeyProvider(run: RunSecurity, service?, account?): KeyProvider`; `type RunSecurity = (args: string[]) => Promise<{ code: number; stdout: string }>`; `execSecurity: RunSecurity` (runs `/usr/bin/security` with a 5 s timeout); `selectKeyProvider('keychain', ...)` now returns the Keychain provider. The Keychain item: service `com.jazurite.digismith.nexus`, account `profile-key`, value = the 32-byte key in base64.

- [ ] **Step 1: Write the failing tests (an injected fake `security`)**

Append to `key-provider.test.ts`:

```ts
import { keychainKeyProvider } from './key-provider.ts'
import { randomBytes } from 'node:crypto'

describe('keychain key provider', () => {
  const key = randomBytes(32)
  it('reads the item and decodes the 32-byte key', async () => {
    const calls: string[][] = []
    const got = await keychainKeyProvider(async a => { calls.push(a); return { code: 0, stdout: key.toString('base64') + '\n' } }).getKey()
    expect(got.equals(key)).toBe(true)
    expect(calls[0]).toEqual(['find-generic-password', '-s', 'com.jazurite.digismith.nexus', '-a', 'profile-key', '-w'])
  })
  it.each([
    ['not found', { code: 44, stdout: '' }],
    ['locked or no interaction allowed', { code: 36, stdout: '' }],
    ['a value of the wrong length', { code: 0, stdout: Buffer.alloc(5).toString('base64') }],
  ])('fails with key_unavailable: %s', async (_n, r) => {
    await expect(keychainKeyProvider(async () => r).getKey()).rejects.toMatchObject({ code: 'key_unavailable' })
  })
  it('fails with key_unavailable when security cannot run or times out', async () => {
    await expect(keychainKeyProvider(async () => { throw new Error('timeout') }).getKey()).rejects.toMatchObject({ code: 'key_unavailable' })
  })
  it('selectKeyProvider("keychain") now returns a provider (it fails closed only when the Keychain says no)', () => {
    expect(() => selectKeyProvider('keychain', { keyFile: '/nowhere' })).not.toThrow()
  })
})
```

Delete the old test `'keychain is not available yet: it fails closed'` from task 4.

`scripts/nexus-api/probe-keychain.test.ts`:

```ts
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { probe } from './probe-keychain.ts'

describe('keychain probe', () => {
  it('logs ok and the key length, never the key', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'probe-')); const key = randomBytes(32)
    await probe({ logFile: join(dir, 'probe.log'), run: async () => ({ code: 0, stdout: key.toString('base64') }), now: () => 0 })
    const log = readFileSync(join(dir, 'probe.log'), 'utf8')
    expect(log).toBe('1970-01-01T00:00:00.000Z ok len=32\n')
    expect(log).not.toContain(key.toString('base64'))
  })
  it('logs fail with a reason code and nothing else when the Keychain says no', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'probe-'))
    await probe({ logFile: join(dir, 'probe.log'), run: async () => ({ code: 36, stdout: '' }), now: () => 0 })
    expect(readFileSync(join(dir, 'probe.log'), 'utf8')).toBe('1970-01-01T00:00:00.000Z fail code=36\n')
  })
})
```

Run: `pnpm vitest run scripts/nexus-api` → FAIL.

- [ ] **Step 2: Implement**

Append to `key-provider.ts`:

```ts
import { execFile } from 'node:child_process'

export type RunSecurity = (args: string[]) => Promise<{ code: number; stdout: string }>
export const execSecurity: RunSecurity = args => new Promise(resolve => {
  execFile('/usr/bin/security', args, { timeout: 5000 }, (err, stdout) => resolve({ code: err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1) : 0, stdout: String(stdout) }))
})

const SERVICE = 'com.jazurite.digismith.nexus'
const ACCOUNT = 'profile-key'

// The key lives in the login Keychain as base64. Any failure (not found, locked, no interaction allowed, timeout) is key_unavailable.
export function keychainKeyProvider(run: RunSecurity = execSecurity, service = SERVICE, account = ACCOUNT): KeyProvider {
  return {
    async getKey() {
      let r: { code: number; stdout: string }
      try { r = await run(['find-generic-password', '-s', service, '-a', account, '-w']) } catch { throw new KeyError() }
      if (r.code !== 0) throw new KeyError()
      const key = Buffer.from(r.stdout.trim(), 'base64')
      if (key.length !== KEY_BYTES) throw new KeyError()
      return key
    },
  }
}
```

and change `selectKeyProvider` so `'keychain'` returns `keychainKeyProvider()`; any other name still throws `KeyError`.

`scripts/nexus-api/probe-keychain.ts`:

```ts
// Proves the LaunchAgent can read the Keychain item (spec section 8). Writes one line: ok len=<n> or fail code=<n>. Never the key.
import { appendFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execSecurity, keychainKeyProvider, type RunSecurity } from './src/key-provider.ts'

export async function probe(opts: { logFile: string; run: RunSecurity; now?: () => number }): Promise<void> {
  const at = new Date((opts.now ?? Date.now)()).toISOString()
  let r: { code: number; stdout: string }
  try { r = await opts.run(['find-generic-password', '-s', 'com.jazurite.digismith.nexus', '-a', 'profile-key', '-w']) } catch { r = { code: 1, stdout: '' } }
  if (r.code === 0) {
    try { const key = await keychainKeyProvider(async () => r).getKey(); appendFileSync(opts.logFile, `${at} ok len=${key.length}\n`); return } catch { /* falls through to fail */ }
  }
  appendFileSync(opts.logFile, `${at} fail code=${r.code || 1}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const d = process.env.DIGISMITH_DEPOT ?? join(homedir(), '.digismith-depot')
  probe({ logFile: join(d, 'nexus', 'logs', 'keychain-probe.log'), run: execSecurity }).then(() => process.exit(0))
}
```

`scripts/nexus-api/store-key-in-keychain.ts` (Jack runs it once, in a normal Terminal; it moves the key from the file into the Keychain and prints nothing):

```ts
// Copies the 32-byte key from the key file into the login Keychain (base64). Prints nothing on success.
// The key passes through one process argument for a moment (one-user machine). It never deletes the key file: Jack decides.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { execSecurity } from './src/key-provider.ts'

const d = process.env.DIGISMITH_DEPOT ?? join(homedir(), '.digismith-depot')
const key = readFileSync(join(d, 'nexus', 'profile.key'))
if (key.length !== 32) { process.stderr.write('store failed: key\n'); process.exit(1) }
const r = await execSecurity(['add-generic-password', '-U', '-s', 'com.jazurite.digismith.nexus', '-a', 'profile-key', '-w', key.toString('base64')])
if (r.code !== 0) { process.stderr.write(`store failed: security code=${r.code}\n`); process.exit(1) }
```

`scripts/nexus-api/com.jazurite.digismith.nexus-keychain-probe.plist.tmpl` (a one-shot LaunchAgent; the same shape as the existing `com.jazurite.digismith.nexus-api.plist.tmpl`, but `RunAtLoad` only, no `KeepAlive`; its program is `@NODE@ --experimental-strip-types @DEPOT@/nexus-api/probe-keychain.ts`).

`nexus-api.sh.tmpl`: add the line `export NEXUS_KEY_PROVIDER="@KEY_PROVIDER@"` before the `exec`; in `install.sh` add `KEY_PROVIDER="${NEXUS_KEY_PROVIDER:-file}"` (allowed values `file` or `keychain`, anything else exits 1) and add `-e "s|@KEY_PROVIDER@|$KEY_PROVIDER|g"` to the existing `sed` that writes the wrapper; render the probe plist next to the API plist and copy `probe-keychain.ts` and `store-key-in-keychain.ts` into `$DEPOT/nexus-api/`. Extend `test-install.test.ts`: the wrapper contains `export NEXUS_KEY_PROVIDER="file"` by default and `"keychain"` when asked, and refuses `x`; the probe plist passes `plutil -lint` and has no placeholder.

- [ ] **Step 3: Run**

Run: `pnpm vitest run scripts/nexus-api` → PASS.

- [ ] **Step 4: Commit**

```bash
git add -- scripts/nexus-api
git commit -m "feat(dgs-481): add the Keychain key provider and its probe" -- scripts/nexus-api
```

- [ ] **Step 5: The Keychain runbook (Jack and the Maestro; the builder stops after step 4)**

1. Jack, in a normal Terminal: `node --experimental-strip-types ~/.digismith-depot/nexus-api/store-key-in-keychain.ts` (no output = stored).
2. Jack loads the probe: copy the rendered probe plist to `~/Library/LaunchAgents/` and `launchctl bootstrap gui/$(id -u) ...`; read `~/.digismith-depot/nexus/logs/keychain-probe.log` (expect `ok len=32`).
3. Reboot the Mac (auto-login), wait, run the probe again (`launchctl kickstart -k gui/$(id -u)/com.jazurite.digismith.nexus-keychain-probe`), and read the log. If it says `fail`, the login Keychain is locked after reboot: stop, keep the file provider, and tell Jack plainly.
4. Only if both probes say `ok`: `NEXUS_KEY_PROVIDER=keychain sh scripts/nexus-api/install.sh`, restart the API, run `node scripts/nexus-web/health-check.mjs` (expect `ok`), then Jack decides whether to delete `profile.key`.

---

### Task 20: Accessibility sign-off with a screen reader (Jack)

**Files:**
- Create: `scripts/nexus-web/tests/a11y/voiceover-checklist.md`

- [ ] **Step 1: Write the checklist**

```md
# VoiceOver pass for the life dashboard (DGS-481)

Run on the Mac with Safari or Chrome and VoiceOver (Cmd+F5), then once on an iPhone with VoiceOver, against https://pazurite.com/.
Tick each line. Write what you heard if a line fails.

- [ ] "Skip to the calendar" is the first stop and jumps to the calendar.
- [ ] The three numbers are read as "weeks lived 1,913" style pairs (label and value together).
- [ ] The grid is announced as a grid with a name that tells you to use the arrow keys.
- [ ] On the grid, arrow keys move one week; each box reads "Age N, week W of 52, <date> to <date>, lived|this week|ahead".
- [ ] Row headers read "Age N"; the column headers read "Week 1, 13, 26, 39, 52".
- [ ] Home, End, Page Up, Page Down, Ctrl+Home, Ctrl+End work as in the spec; Escape hides the tooltip.
- [ ] Turn the API off (stop the Nexus API): the panel is announced as an alert; Retry is reachable and says "Retrying…" while it works.
- [ ] After a successful Retry, focus lands on the grid.
- [ ] The two recorded exceptions (tests/a11y/EXCEPTIONS.md) are acceptable to you: tiny box targets, and a tooltip that is not hoverable.

Sign-off: ______ (name, date)
```

- [ ] **Step 2: Commit**

```bash
git add -- scripts/nexus-web/tests/a11y/voiceover-checklist.md
git commit -m "docs(dgs-481): add the screen-reader sign-off checklist" -- scripts/nexus-web/tests/a11y/voiceover-checklist.md
```

Jack runs the checklist. The ticket is done when he signs it.

---

## Self-Review (spec coverage)

| Spec section | Where it is built |
|---|---|
| 2 Privacy, decision A | Global Constraints; tasks 5, 6, 7 (no-secret-in-logs); fakes in every test |
| 3 Hono step | Task 1 (bytes fixture, HEAD, 404/405, charset), Task 2 (logger) |
| 4 Pieces, pins | File Structure; package.json files in tasks 1, 3, 9, 14, 15, 16, 18 |
| 5 Counting rule | Task 3 (`computeCalendar`, tests for 29 February, UTC+7, before and past) |
| 6 Shared schema, JSON | Task 3 (strict schema), Task 7 (route validates the response), Task 10 (page validates) |
| 7 Database (PGlite) | Task 5; seed in 6 (single owner of the folder: stop the API first, runbook in 13) |
| 8 Encryption, key providers | Task 4 (file provider), Task 19 (Keychain, probe) |
| 9 Seed step | Task 6 |
| 10 Errors and logging | Task 1, 2, 7; page mapping Task 10 |
| 11 Page (Nuxt, Vue, Storybook) | Tasks 9 to 12, 14 |
| 12 Accessibility | Tasks 11, 12 (roles, keys, labels), 16 (axe, contrast), 20 (screen reader) |
| 13 Performance | Task 11 (skeleton geometry), Task 12 (one listener), Task 18 (budgets) |
| 14 Caddy | Task 8 |
| 15 Tests | In every task; E2E 15; visual 17 |
| 16 Deploy steps | Task 13 runbook, Task 19 runbook |
| 17 Not in version 1 | Not built (CDN, phases, events, widgets, real PostgreSQL, SSR) |

Known deviations from the spec text, to be written back into the spec by the Maestro's decision: (a) the pointer is found through the delegated event target (`closest('[data-row]')`), not by arithmetic (the spec said arithmetic); (b) `NEXUS_KEY_PROVIDER` defaults to `file` in the wrapper, and the wrapper only gains the setting in task 19; (c) the locked-panel wording says "Check the key" instead of "Unlock the Keychain", pending Jack; (d) the tooltip date in the Designer's text example ("12 Oct 2026 – 18 Oct 2026") is only an example: the counting rule gives 15 Oct 2026 – 21 Oct 2026 for this week, and the Designer's mock data agrees with the rule.
