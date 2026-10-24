# DGS-599 Oculus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the Nightwatch dashboard surface to Oculus, serve it as its own static site for `oculus.pazurite.com`, and make its index page show every herdr agent on the Workbox (all workspaces) with the attention summary, a disconnected state backed by a depot snapshot, and the side bar clear of the left edge.

**Architecture:** The CLI stays the only reader of depot files and of herdr: a new read-only view `dg oculus view live` runs herdr with one fixed argv and joins agents to run records. The Nexus API serves it at `/api/v1/oculus/live` through the existing 5 s cached, single-flight reader and keeps the last good answer in `$DEPOT/nexus/state/`. One Nuxt project builds two static sites (`NEXUS_SITE=life|oculus`, outputs `.output/` and `.output-oculus/`); `build-www.sh` publishes both behind two symlinks. Caddy and DNS changes are repo files only here; the live change is a separate step after the merge.

**Tech Stack:** Node 24 (`--experimental-strip-types`), TypeScript, yargs, Vitest, Hono + zod (Nexus API), Nuxt 4 static generate + Vue 3, Storybook 10, Playwright 1.64.1 (+ axe), Caddy 2.11.7 (repo Caddyfile only).

**Spec:** `.digismith/board/DGS-599—dashboard-live/design.html` (approved by Jack, commit `6478226`).

## Global Constraints

- Code in `packages/cli/src/` must run under `node --experimental-strip-types`: no parameter properties, no enums, no namespaces (the smoke test strips every file).
- pnpm only. Run `pnpm install` once at the worktree root before Task 1. Never run `pnpm install` in `~/.digismith-depot/repo`.
- Browsers for Playwright: if a run says an executable is missing, run `pnpm --dir scripts/nexus-web exec playwright install chromium webkit` (downloads into `~/Library/Caches/ms-playwright`, nothing in the repo).
- Tests use fakes only: no real herdr, no real ClickUp, no live API, no real depot (`DIGISMITH_DEPOT_DIR` / `DIGISMITH_DEPOT` in a temp folder), no real Caddy service, DNS or Tailscale.
- herdr access: only `dg oculus view live`, argv exactly `--session default agent list`, `XDG_CONFIG_HOME=$HOME/.config`, timeout 3 s. Never `agent read`, `prompt`, `send-keys` or any other verb. herdr-ws is not changed.
- Privacy: no pane text, no `terminal_title`, no prompt, no message text, no folder path in any output, file or page. Names, ids, statuses, counts only.
- No Caddy, DNS, Tailscale, pf, LaunchAgent, sudo or settings change in any task. Caddy files change in the repo only (`scripts/caddy/`). No delete outside the worktree; never answer a delete prompt.
- Page titles: "DigiSmith Oculus" (index), "<Page> · DigiSmith Oculus" (others). Side bar brand "Oculus". Nav landmark "Oculus".
- API prefix `/api/v1/oculus/`; `/api/v1/nightwatch/` answers 404. No redirect from `pazurite.com/nightwatch/`.
- Snapshot file `$DEPOT/nexus/state/oculus-live-last.json`: folder mode 700, file mode 600, never under `nexus/www` or `nexus/oculus`.
- Warren token values and `scripts/nexus-web/public/THIRD-PARTY-NOTICES.txt` (MIT notice) unchanged; only token names change.
- Engine names stay (spec appendix; their rename is DGS-604): run/event/attention/journal schemas, `nightwatch-watchdog` job, `nightwatch:` config block, `dg run`, notify text, catch-up heading.
- DGS-586 lessons: a live region announces sets of ids, never the whole table; no false green; table row cards keep ARIA roles; nothing shows pane text.
- Times in UI and docs: UTC+7 first, UTC in brackets when it came from a tool.
- Commits: title-only conventional (`feat(oculus): …`, `test(oculus): …`), no AI attribution, commit with a pathspec.

## Test commands (used in every task)

- CLI: `pnpm --filter @digismith/cli exec vitest run <path>` (from the worktree root).
- Nexus API, Caddy unit and repo tests: `pnpm vitest run <path>` (root config).
- Caddy front door: `CADDY_BIN=$HOME/.digismith-depot/bin/caddy node scripts/caddy/test-config.mjs` (a throwaway Caddy on 127.0.0.1 high ports; never touches the depot service).
- Web unit: `pnpm --dir scripts/nexus-web exec vitest run <path>`; typecheck: `pnpm --dir scripts/nexus-web typecheck`.
- Web gates: `pnpm --dir scripts/nexus-web generate`, then `pnpm --dir scripts/nexus-web exec playwright test <path>`; baselines: add `--update-snapshots` only in the step that says so.
- Storybook build: `pnpm --dir scripts/nexus-web build-storybook`.

## File structure

| Area | Files |
|---|---|
| CLI views | `packages/cli/src/oculus/` (renamed from `nightwatch/`): `index.ts` (command + `runOculus`), `views.ts`, `derive.ts`, `types.ts`, **new** `live.ts` (herdr call, allowlist, role, project, run join) |
| Shared schema | `scripts/nexus-shared/oculus.ts` (renamed), new live schemas |
| Nexus API | `scripts/nexus-api/src/oculus-route.ts`, `oculus-reader.ts` (renamed), **new** `oculus-snapshot.ts`, `app.ts`, `server.ts` |
| Web | `app/components/oc/Oc*` (renamed), new `OcAgentsTable.vue`, `OcAgentStatus.vue`, `OcAgentFilters.vue`, `OcAttentionSummary.vue`, `OcDisconnectedBanner.vue`; `app/utils/agent-changes.ts`; `app/layouts/oculus.vue`; `app/pages/oculus/*` (served at `/`); `site-pages.ts`; `nuxt.config.ts`; `build-www.sh` |
| Caddy | `scripts/caddy/Caddyfile`, `caddy-run.sh`, `test-config.mjs` |
| Tests | `tests/oculus-fixtures.ts`, `tests/e2e/oculus.spec.ts`, `tests/e2e/stub-server.ts`, `tests/a11y/oculus-axe.spec.ts`, `tests/visual/oculus-mobile.spec.ts`, `tests/visual/sidebar-edge*.spec.ts`, `tests/unit/built-*.test.ts` |

---

### Task 1: Side bar edge fix

Reproduce Jack's clipping first, then move the side bar text to the 24 px gutter.

**Files:**
- Create: `.digismith/board/DGS-599—dashboard-live/sidebar-probe.md`
- Create: `scripts/nexus-web/tests/visual/sidebar-edge.spec.ts`
- Create: `scripts/nexus-web/tests/visual/sidebar-edge-webkit.spec.ts`
- Modify: `scripts/nexus-web/app/components/nw/NwNav.vue` (style block)
- Modify: `scripts/nexus-web/app/components/nw/NwTopBar.vue` (`.bar` padding)
- Modify: `scripts/nexus-web/app/components/nw/NwShell.vue` (`.main` padding)

**Interfaces:**
- Consumes: `startStubForNightwatch()` from `tests/e2e/stub-server.ts` (serves `.output/public` with the `nw-ok` fixtures).
- Produces: nothing new for later tasks. Task 3 renames these files; Task 4 changes the paths in the two specs from `/nightwatch/` to `/`.

- [ ] **Step 1: Reproduce in WebKit and write the probe note**

Build once and measure the brand and the "WATCH" label in WebKit at 1440×900, 1024×768 and iPhone 14 landscape:

```bash
pnpm --dir scripts/nexus-web generate
cat > scripts/nexus-web/.probe-dgs599.mts <<'EOF'
import { webkit, devices } from '@playwright/test'
import { startStubForNightwatch } from './tests/e2e/stub-server.ts'
const stub = await startStubForNightwatch()
const b = await webkit.launch()
for (const [name, ctx] of [['1440', { viewport: { width: 1440, height: 900 } }], ['1024', { viewport: { width: 1024, height: 768 } }], ['iphone-landscape', devices['iPhone 14 landscape']]]) {
  const p = await (await b.newContext(ctx)).newPage()
  await p.goto(`${stub.url}/nightwatch/`); await p.locator('main h1').waitFor()
  const m = await p.evaluate(() => [...document.querySelectorAll('.nw-nav .brand, .nw-nav h2, .nw-nav .link')].slice(0, 3).map(e => { const r = document.createRange(); r.selectNodeContents(e); return Math.round(r.getBoundingClientRect().left) }))
  console.log(name, JSON.stringify(m))
}
await b.close(); await stub.close()
EOF
(cd scripts/nexus-web && node --experimental-strip-types .probe-dgs599.mts)
rm scripts/nexus-web/.probe-dgs599.mts   # a scratch file inside the worktree, never committed
```

Write `sidebar-probe.md` with the date (UTC+7), each size and the measured text left edges, and one line: the cause is the 18 px inset (the smallest on the page, `.nw-nav` 10 px + 8 px inner padding) or a different cause you found. If the cause is different, write it, fix that cause in Step 5 as well, and keep the 24 px target.

- [ ] **Step 2: Write the failing edge test (Chromium, desktop and phone)**

`scripts/nexus-web/tests/visual/sidebar-edge.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { startStubForNightwatch } from '../e2e/stub-server.ts'

// DGS-599: the side bar text starts at the 24 px page gutter (16 px nav padding + 8 px inner padding), never at the window edge.
let stub: Awaited<ReturnType<typeof startStubForNightwatch>>
test.beforeAll(async () => { stub = await startStubForNightwatch() })
test.afterAll(async () => { await stub.close() })

const PATH = '/nightwatch/'
// the left edge of the text itself, not of the box
const textLeft = (els: Element[]) => els.slice(0, 1).map((e) => { const r = document.createRange(); r.selectNodeContents(e); return Math.round(r.getBoundingClientRect().left) })[0]

for (const width of [1440, 1024]) {
  test(`side bar text starts at 24 px at ${width} px`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop project only')
    await page.setViewportSize({ width, height: 900 })
    await page.clock.install({ time: new Date('2026-10-22T03:00:00Z') })
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.goto(`${stub.url}${PATH}`)
    await page.locator('main h1').waitFor()
    for (const sel of ['nav .brand', 'nav h2', 'nav a']) expect(await page.locator(sel).evaluateAll(textLeft), sel).toBe(24)
    await page.evaluate(() => document.fonts.ready)
    await expect(page.locator('nav').first()).toHaveScreenshot(`sidebar-edge-${width}-desktop.png`)
  })
}

test('phone nav row: the first link text starts at 24 px', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phone project only')
  await page.clock.install({ time: new Date('2026-10-22T03:00:00Z') })
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.goto(`${stub.url}${PATH}`)
  await page.locator('main h1').waitFor()
  expect(await page.locator('nav a').evaluateAll(textLeft)).toBe(24)
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator('nav').first()).toHaveScreenshot('sidebar-edge-390-phone.png')
})
```

`scripts/nexus-web/tests/visual/sidebar-edge-webkit.spec.ts` (browserName is a worker option, so WebKit gets its own file):

```ts
import { devices, expect, test } from '@playwright/test'
import { startStubForNightwatch } from '../e2e/stub-server.ts'

test.use({ browserName: 'webkit', ...devices['iPhone 14 landscape'] })
let stub: Awaited<ReturnType<typeof startStubForNightwatch>>
test.beforeAll(async () => { stub = await startStubForNightwatch() })
test.afterAll(async () => { await stub.close() })

test('WebKit landscape phone: side bar text clear of the edge (safe area)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'runs once')
  await page.clock.install({ time: new Date('2026-10-22T03:00:00Z') })
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.goto(`${stub.url}/nightwatch/`)
  await page.locator('main h1').waitFor()
  const left = await page.locator('nav .brand, nav a').first().evaluate((e) => { const r = document.createRange(); r.selectNodeContents(e); return Math.round(r.getBoundingClientRect().left) })
  expect(left).toBeGreaterThanOrEqual(16)
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator('nav').first()).toHaveScreenshot('sidebar-edge-iphone-landscape-webkit.png')
})
```

- [ ] **Step 3: Run the tests and see them fail**

Run: `pnpm --dir scripts/nexus-web exec playwright test tests/visual/sidebar-edge.spec.ts tests/visual/sidebar-edge-webkit.spec.ts`
Expected: FAIL: desktop text at 18 (expected 24), phone first link at 14 (expected 24). (The screenshot steps fail too: there is no baseline yet.)

- [ ] **Step 4: Fix the CSS**

`NwNav.vue` style block: replace the `.nw-nav` rule and the phone rule:

```scss
// DGS-599: 16 px nav padding + the 8 px inner padding of the brand, the label and the links = the 24 px page gutter. env() is 0 without an inset.
.nw-nav { background: var(--nw-sidebar); border-right: 1px solid var(--nw-border); padding: 16px 10px; padding-inline-start: max(16px, env(safe-area-inset-left)); }
```

```scss
@media (max-width: 760px) {
  .nw-nav { display: flex; overflow-x: auto; padding: 6px max(16px, env(safe-area-inset-right)) 6px max(16px, env(safe-area-inset-left)); border-right: 0; border-bottom: 1px solid var(--nw-border); }
  .brand, h2 { display: none; }
  .link { white-space: nowrap; gap: 8px; }
}
```

`NwTopBar.vue`: `.bar` padding becomes `padding: 10px max(24px, env(safe-area-inset-right)) 10px max(24px, env(safe-area-inset-left));` and the phone rule `.bar { padding: 10px max(16px, env(safe-area-inset-right)) 10px max(16px, env(safe-area-inset-left)); }`.

`NwShell.vue`: `.main { padding: 20px max(24px, env(safe-area-inset-right)) 48px max(24px, env(safe-area-inset-left)); }` and the phone rule `.main { padding: 16px max(16px, env(safe-area-inset-right)) 16px max(16px, env(safe-area-inset-left)); }`.

- [ ] **Step 5: Run the position checks, then make the new baselines**

Run: `pnpm --dir scripts/nexus-web generate && pnpm --dir scripts/nexus-web exec playwright test tests/visual/sidebar-edge.spec.ts tests/visual/sidebar-edge-webkit.spec.ts --update-snapshots`
Expected: PASS; four new PNGs in `tests/visual/__screenshots__/` (`sidebar-edge-1440-desktop.png`, `sidebar-edge-1024-desktop.png`, `sidebar-edge-390-phone.png`, `sidebar-edge-iphone-landscape-webkit.png`). Open each PNG and check the text is clear of the edge.

- [ ] **Step 6: Update the baselines this fix moves, and run the whole web gate**

The fix moves the side bar in the Nightwatch page and Storybook baselines. Run:

```bash
pnpm --dir scripts/nexus-web build-storybook
pnpm --dir scripts/nexus-web exec playwright test tests/visual --update-snapshots
git -C scripts/nexus-web diff --stat -- tests/visual/__screenshots__
```

Expected: only `nightwatch-mobile-*`, `nightwatch-nav--*`, `nightwatch-shell--*`, `nightwatch-topbar--*` and the new `sidebar-edge-*` files change. Any other changed baseline is a regression: stop and fix it. Then run `pnpm --dir scripts/nexus-web test` and `pnpm --dir scripts/nexus-web exec playwright test tests/e2e tests/a11y`: all PASS.

- [ ] **Step 7: Commit**

```bash
git add -- scripts/nexus-web/app/components/nw/NwNav.vue scripts/nexus-web/app/components/nw/NwTopBar.vue scripts/nexus-web/app/components/nw/NwShell.vue scripts/nexus-web/tests/visual ".digismith/board/DGS-599—dashboard-live/sidebar-probe.md"
git commit -m "fix(oculus): keep the side bar text at the page gutter" -- scripts/nexus-web/app/components/nw scripts/nexus-web/tests/visual ".digismith/board/DGS-599—dashboard-live/sidebar-probe.md"
```

---

### Task 2: Rename the back end to Oculus (CLI view, shared schema, API routes)

Behaviour does not change; names and the API prefix do. The web client follows only as far as it must to keep working (schema alias and API base).

**Files:**
- Rename: `packages/cli/src/nightwatch/` → `packages/cli/src/oculus/` (all files)
- Modify: `packages/cli/src/oculus/index.ts`, `packages/cli/src/index.ts:19,47`, `packages/cli/src/strip-types.smoke.test.ts:14-27`, `packages/cli/src/oculus/README.md`, `packages/cli/src/oculus/fixture.test-util.ts` (temp prefix `oc-depot-`)
- Rename: `scripts/nexus-shared/nightwatch.ts` → `scripts/nexus-shared/oculus.ts`
- Rename: `scripts/nexus-api/src/nightwatch-route.ts` → `oculus-route.ts`, `nightwatch-route.test.ts` → `oculus-route.test.ts`, `nightwatch-reader.ts` → `oculus-reader.ts`, `nightwatch-reader.test.ts` → `oculus-reader.test.ts`, `nightwatch-contract.test.ts` → `oculus-contract.test.ts`
- Modify: `scripts/nexus-api/src/app.ts`, `scripts/nexus-api/src/server.ts:19,92-93`
- Modify (web, only what the rename forces): `scripts/nexus-web/nuxt.config.ts` (alias), every `'#nightwatch-schema'` import under `scripts/nexus-web/app` and `scripts/nexus-web/tests`, `scripts/nexus-web/app/composables/nightwatch-api.ts` (BASE, error schema), `scripts/nexus-web/tests/e2e/stub-server.ts` (reader import, deps key)

**Interfaces:**
- Produces: `runOculus(argv: string[], env: NodeJS.ProcessEnv, now: Date, deps?: OculusDeps): Result` in `packages/cli/src/oculus/index.ts` (Task 6 adds `OculusDeps`); command `dg oculus view <name>`.
- Produces: `OCULUS_PATH = '/api/v1/oculus'`, `createOculusRoutes(deps: OculusDeps)`, `OculusDeps { read: Reader; jobs?: () => JobInfo[]; now?: () => number }` in `oculus-route.ts`; `AppDeps.oculus?: OculusDeps` in `app.ts`.
- Produces: `scripts/nexus-shared/oculus.ts` exports every name `nightwatch.ts` exported, with `NIGHTWATCH_ERROR_CODES` → `OCULUS_ERROR_CODES` and `nightwatchErrorSchema` → `oculusErrorSchema`; alias `#oculus-schema`.
- Produces: `ViewName` in `oculus-reader.ts` (Task 7 adds `'live'`).

- [ ] **Step 1: Write the failing tests**

In `scripts/nexus-api/src/nightwatch-route.test.ts` (it is renamed in Step 3), add at the end of the file:

```ts
describe('Oculus prefix (DGS-599)', () => {
  it('serves /api/v1/oculus/overview and answers 404 on the old /api/v1/nightwatch/ prefix', async () => {
    const a = app(async () => overviewView)
    expect((await a.request('/api/v1/oculus/overview')).status).toBe(200)
    expect((await a.request('/api/v1/nightwatch/overview')).status).toBe(404)
  })
})
```

In `packages/cli/src/strip-types.smoke.test.ts` change the help loop to `[["--help"], ["autonomous", "--help"], ["oculus", "--help"]]`, the matcher to `/autonomous|scan|report|oculus|view/i`, and the view test to run `"oculus", "view", "overview", "--json"` with the describe/it names `"oculus view under --experimental-strip-types"` / `"dg oculus view overview --json on an empty depot"`. Add one more case in the same describe:

```ts
  it("dg nightwatch is not a command any more", async () => {
    const depot = mkdtempSync(join(tmpdir(), "oc-smoke-"));
    const r = await run(process.execPath, ["--experimental-strip-types", entry, "nightwatch", "view", "overview"], { env: { ...process.env, DIGISMITH_DEPOT_DIR: depot } }).catch((e: { code: number; stdout: string }) => e);
    expect((r as { code?: number }).code ?? 0).not.toBe(0);
  });
```

(Use the file's existing `run`, `entry`, `mkdtempSync`, `tmpdir`, `join` imports; add any that are missing.)

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm vitest run scripts/nexus-api/src/nightwatch-route.test.ts` → FAIL (404 for `/api/v1/oculus/overview`).
Run: `pnpm --filter @digismith/cli exec vitest run src/strip-types.smoke.test.ts` → FAIL (unknown command `oculus`).

- [ ] **Step 3: Move the files**

```bash
git mv packages/cli/src/nightwatch packages/cli/src/oculus
git mv scripts/nexus-shared/nightwatch.ts scripts/nexus-shared/oculus.ts
for f in route route.test reader reader.test contract.test; do git mv "scripts/nexus-api/src/nightwatch-$f.ts" "scripts/nexus-api/src/oculus-$f.ts"; done
```

- [ ] **Step 4: Rename inside the files**

`packages/cli/src/oculus/index.ts`: rename `runNightwatch` → `runOculus`; usage text `"usage: oculus view <name>"`; the command object:

```ts
const oculusCommand: CommandModule = {
  command: "oculus",
  describe: "read-only views for Oculus (served by the Nexus API)",
  builder: (y) => y.command({
    command: "view <name>",
    describe: `print one JSON view: ${VIEW_NAMES.join(", ")}`,
    builder: (v) => v.positional("name", { type: "string", demandOption: true }).strict(false),
    handler: () => {
      const i = process.argv.indexOf("oculus");
      const r = runOculus(process.argv.slice(i + 1), process.env, new Date());
      if (r.out) process.stdout.write(r.out);
      if (r.err) process.stderr.write(r.err);
      process.exitCode = r.code;
    },
  }).demandCommand(1),
  handler: () => undefined,
};
export default oculusCommand;
```

`packages/cli/src/index.ts`: `import oculusCommand from "./oculus/index.ts";` and `.command(oculusCommand)`. In `packages/cli/src/oculus/*.test.ts` replace `runNightwatch` with `runOculus` and `"./index.ts"` imports stay. `fixture.test-util.ts`: header comment path and `mkdtempSync(join(tmpdir(), "oc-depot-"))`. Do NOT change the record schemas written by the fixture (`nightwatch-run/v1`, `nightwatch-event/v1`): they are engine names. `README.md`: title and commands say `dg oculus view`.

`scripts/nexus-shared/oculus.ts`: `export const OCULUS_ERROR_CODES = [...]` and `export const oculusErrorSchema = z.strictObject({ error: z.enum(OCULUS_ERROR_CODES), message: z.string().optional() })`; nothing else changes.

`scripts/nexus-api/src/oculus-route.ts`:

```ts
// scripts/nexus-api/src/oculus-route.ts
import { attentionSchema, eventsSchema, overviewViewSchema, planSchema, runDetailSchema, runsSchema, EVENT_GROUPS, HEALTH, ROLES, TRIGGERS } from '../../nexus-shared/oculus.ts'
import { ReaderError, type Reader, type ViewArgs, type ViewName } from './oculus-reader.ts'

export const OCULUS_PATH = `/api/${API_VERSION}/oculus` as const
export interface OculusDeps { read: Reader; jobs?: () => JobInfo[]; now?: () => number }
const KNOWN_PATH = new RegExp(`^${OCULUS_PATH}/(overview|attention|runs|runs/[^/]+|runs/[^/]+/events|plan/[^/]+)$`)
export function createOculusRoutes(deps: OculusDeps): Hono<Env> { /* body unchanged, every NIGHTWATCH_PATH becomes OCULUS_PATH */ }
```

Keep `nexusStatus` and its job names (`nightwatch-watchdog`) unchanged.

`scripts/nexus-api/src/oculus-reader.ts`: header comment path; the argv line becomes `const argv = [entry, 'oculus', 'view', view]`; the comment names `packages/cli/src/oculus/index.ts`.

`scripts/nexus-api/src/app.ts`: `import { createOculusRoutes, type OculusDeps } from './oculus-route.ts'`; `AppDeps { …; oculus?: OculusDeps }`; `if (deps.oculus) app.route('/', createOculusRoutes(deps.oculus))`.

`scripts/nexus-api/src/server.ts`: `import { createReader } from './oculus-reader.ts'`; `const oculus = { read: createReader(), ...(eng ? { jobs: () => eng.snapshot() } : {}) }` and pass `oculus` instead of `nightwatch` to `createApiServer`.

The three renamed API test files: update imports (`./oculus-route.ts`, `./oculus-reader.ts`, `../../nexus-shared/oculus.ts`), `createNightwatchRoutes` → `createOculusRoutes`, every `/api/v1/nightwatch/` → `/api/v1/oculus/` except the 404 assertion added in Step 1. In `oculus-reader.test.ts` the expected argv contains `'oculus', 'view'`.

Web, only what the rename forces:

```bash
cd scripts/nexus-web
grep -rl "#nightwatch-schema" app tests | xargs perl -pi -e "s/#nightwatch-schema/#oculus-schema/g"
perl -pi -e "s#const BASE = '/api/v1/nightwatch'#const BASE = '/api/v1/oculus'#; s/nightwatchErrorSchema/oculusErrorSchema/g" app/composables/nightwatch-api.ts
git grep -l "/api/v1/nightwatch" -- app tests | xargs perl -pi -e "s#/api/v1/nightwatch#/api/v1/oculus#g"
perl -pi -e "s#nexus-api/src/nightwatch-reader.ts#nexus-api/src/oculus-reader.ts#; s/\\bnightwatch: \\{ read:/oculus: { read:/" tests/e2e/stub-server.ts
cd -
```

In `scripts/nexus-web/nuxt.config.ts` change the alias line by hand to `'#oculus-schema': fileURLToPath(new URL('../nexus-shared/oculus.ts', import.meta.url)),` (it replaces the `#nightwatch-schema` line).

Check `git grep -n "nightwatch" -- scripts/nexus-web/nuxt.config.ts scripts/nexus-web/app/composables/nightwatch-api.ts` shows no API or schema name any more (the file name itself changes in Task 3).

- [ ] **Step 5: Run the tests and see them pass**

```bash
pnpm --filter @digismith/cli exec vitest run src/oculus src/strip-types.smoke.test.ts
pnpm vitest run scripts/nexus-api
pnpm --dir scripts/nexus-web typecheck
pnpm --dir scripts/nexus-web test
pnpm --dir scripts/nexus-web generate && pnpm --dir scripts/nexus-web exec playwright test tests/e2e tests/a11y
```

Expected: all PASS.

- [ ] **Step 6: Check no back-end Nightwatch dashboard name is left**

Run: `git grep -n -i "nightwatch" -- packages/cli/src/oculus scripts/nexus-api/src/oculus-* scripts/nexus-api/src/app.ts scripts/nexus-api/src/server.ts scripts/nexus-shared/oculus.ts packages/cli/src/index.ts`
Expected: only engine names (`nightwatch-run/v1`, `nightwatch-event/v1`, `nightwatch-attention/v1`, `nightwatch-journal/v1`, `nightwatch-watchdog`, the `nightwatch:` config block) and the 404 test.

- [ ] **Step 7: Commit**

```bash
git add -A -- packages/cli/src scripts/nexus-api/src scripts/nexus-shared scripts/nexus-web/nuxt.config.ts scripts/nexus-web/app scripts/nexus-web/tests
git commit -m "refactor(oculus): rename the dashboard API, CLI view and schema to Oculus" -- packages/cli/src scripts/nexus-api/src scripts/nexus-shared scripts/nexus-web/nuxt.config.ts scripts/nexus-web/app scripts/nexus-web/tests
```

---

### Task 3: Rename the web surface to Oculus (components, tokens, composables, tests, baselines)

Mechanical rename; the pages keep their `/nightwatch/` paths and titles until Task 4.

**Files:**
- Rename: `scripts/nexus-web/app/components/nw/` → `app/components/oc/`; each `Nw*.vue` / `Nw*.stories.ts` → `Oc*`
- Rename: `app/layouts/nightwatch.vue` → `oculus.vue`, `app/layouts/nightwatch.test.ts` → `oculus.test.ts`
- Rename: `app/assets/nightwatch-tokens.scss` → `oculus-tokens.scss`
- Rename: `app/composables/nightwatch-api.ts` (+`.test.ts`) → `oculus-api.ts`; `useNightwatchPoll.ts` (+test) → `useOculusPoll.ts`; `app/utils/nw-format.ts` (+test) → `oc-format.ts`
- Rename: `tests/nightwatch-fixtures.ts` → `tests/oculus-fixtures.ts`; `tests/e2e/nightwatch.spec.ts` → `oculus.spec.ts`; `tests/a11y/nightwatch-axe.spec.ts` → `oculus-axe.spec.ts`; `tests/visual/nightwatch-mobile.spec.ts` → `oculus-mobile.spec.ts`; `tests/unit/built-nightwatch.test.ts` → `built-oculus.test.ts`; `tests/unit/nightwatch-contrast.test.ts` → `oculus-contrast.test.ts`
- Modify: `nuxt.config.ts` (css list), every `.vue`/`.ts` under `app/` and `tests/` that uses the old names, `tests/visual/stories.spec.ts` (clock prefix), `tests/visual/__screenshots__/` (renamed baselines)

**Interfaces:**
- Produces (used by Tasks 4, 8, 9): components `OcShell`, `OcNav` (props `attention: number; current: string`), `OcTopBar` (props `overview: Overview | null; stale: boolean; updatedAt: number | null`), `OcTable`, `OcStatus`, `OcPanel`, `OcCard`, `OcPageHead`, `OcStaleBanner`, `OcRunsTable`, `OcRunFilters`, `OcWorkersTable`, `OcAttentionTable`, …; layout `oculus` providing `'ocOverview'`; composables `oculus-api.ts` (`OculusApiError`, `loadOverview`, `loadAttention`, `loadRuns`, `loadRun`, `loadEvents`, `loadPlan`), `useOculusPoll<T>(load, opts)`; utils `oc-format.ts` (same exports as `nw-format.ts`); tokens: scope class `.oc`, custom properties `--oc-*`; fixtures `tests/oculus-fixtures.ts`; stub modes `oc-ok | oc-empty | oc-down | oc-more-attention | oc-unknown`, `startStubForOculus()`.

- [ ] **Step 1: Write the failing test**

Create `scripts/nexus-web/tests/unit/no-nightwatch-names.test.ts`:

```ts
// DGS-599: the dashboard surface says Oculus. Engine names (run/event schemas, the nightwatch-watchdog job) may stay.
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const WEB = join(__dirname, '../..')
const ALLOWED = /nightwatch-watchdog|nightwatch-(run|event|attention|journal)\/v1|no-nightwatch-names|\/nightwatch\/|pages\/nightwatch|· Nightwatch|"Nightwatch"|>nightwatch</
function hits(pattern: string): string[] {
  let out = ''
  try { out = execFileSync('git', ['grep', '-n', '-I', '-E', pattern, '--', 'app', 'tests', 'nuxt.config.ts', '.storybook', ':!tests/visual/__screenshots__'], { cwd: WEB, encoding: 'utf8' }) } catch { return [] }
  return out.split('\n').filter(Boolean)
}
describe('no Nightwatch names on the dashboard surface', () => {
  it('no Nw* component, nw- class or --nw- token is left', () => {
    expect(hits('\\bNw[A-Z]|--nw-|\\bnw-[a-z]|\\.nw\\b|nwOverview|nw-format')).toEqual([])
  })
  it('only page paths and titles still say nightwatch (Task 4 moves them)', () => {
    expect(hits('[Nn]ightwatch').filter((l) => !ALLOWED.test(l))).toEqual([])
  })
})
```

(Task 4 tightens the `ALLOWED` pattern once the paths and titles move.)

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --dir scripts/nexus-web exec vitest run tests/unit/no-nightwatch-names.test.ts`
Expected: FAIL with many hits.

- [ ] **Step 3: Move the files**

```bash
cd scripts/nexus-web
git mv app/components/nw app/components/oc
for f in app/components/oc/Nw*; do git mv "$f" "app/components/oc/Oc${f#app/components/oc/Nw}"; done
git mv app/layouts/nightwatch.vue app/layouts/oculus.vue
git mv app/layouts/nightwatch.test.ts app/layouts/oculus.test.ts
git mv app/assets/nightwatch-tokens.scss app/assets/oculus-tokens.scss
git mv app/composables/nightwatch-api.ts app/composables/oculus-api.ts
git mv app/composables/nightwatch-api.test.ts app/composables/oculus-api.test.ts
git mv app/composables/useNightwatchPoll.ts app/composables/useOculusPoll.ts
git mv app/composables/useNightwatchPoll.test.ts app/composables/useOculusPoll.test.ts
git mv app/utils/nw-format.ts app/utils/oc-format.ts
git mv app/utils/nw-format.test.ts app/utils/oc-format.test.ts
git mv tests/nightwatch-fixtures.ts tests/oculus-fixtures.ts
git mv tests/e2e/nightwatch.spec.ts tests/e2e/oculus.spec.ts
git mv tests/a11y/nightwatch-axe.spec.ts tests/a11y/oculus-axe.spec.ts
git mv tests/visual/nightwatch-mobile.spec.ts tests/visual/oculus-mobile.spec.ts
git mv tests/unit/built-nightwatch.test.ts tests/unit/built-oculus.test.ts
git mv tests/unit/nightwatch-contrast.test.ts tests/unit/oculus-contrast.test.ts
cd -
```

- [ ] **Step 4: Rename inside the files**

Run this over `app/`, `tests/` (not the screenshots), `nuxt.config.ts` and `.storybook/`. It keeps `/nightwatch/` URL paths, the `pages/nightwatch` folder and the `· Nightwatch` titles (Task 4) and the engine names:

```bash
cd scripts/nexus-web
FILES=$(git grep -l -I -E 'Nw[A-Z]|--nw-|\bnw-[a-z]|\.nw\b|\bnw\b|nwOverview|isNw|NwMode|nightwatch|Nightwatch' -- app tests nuxt.config.ts .storybook ':!tests/visual/__screenshots__' ':!tests/unit/no-nightwatch-names.test.ts')
perl -pi -e '
  s/\bNw(?=[A-Z])/Oc/g; s/--nw-/--oc-/g; s/\bnw-(?=[a-z])/oc-/g; s/(?<![\w\/-])\.nw\b/.oc/g; s/class="nw"/class="oc"/g;
  s/nwOverview/ocOverview/g; s/\bisNw\b/isOc/g; s/\bNwMode\b/OcMode/g; s/\bnwJobs\b/ocJobs/g; s/\bnwRead\b/ocRead/g; s/\bNW_NOW\b/OC_NOW/g; s/\bnw\b(?=\.)/oc/g;
  s/useNightwatchPoll/useOculusPoll/g; s/nightwatch-api/oculus-api/g; s/NightwatchApiError/OculusApiError/g;
  s/nightwatch-tokens/oculus-tokens/g; s/nightwatch-fixtures/oculus-fixtures/g; s/startStubForNightwatch/startStubForOculus/g;
  s/oc-format|nw-format/oc-format/g; s/layout: .nightwatch./layout: \x27oculus\x27/g;
  s/title: \x27Nightwatch\//title: \x27Oculus\//g; s/e\.id\.startsWith\(\x27nightwatch-\x27\)/e.id.startsWith(\x27oculus-\x27)/g;
  s/nightwatch-mobile-/oculus-mobile-/g; s/nightwatch mobile/oculus mobile/g; s/built-nightwatch/built-oculus/g; s/nightwatch-contrast/oculus-contrast/g; s/nightwatch-axe/oculus-axe/g;
' $FILES
cd -
```

Then fix by hand what the patterns cannot know, and re-read each diff hunk:
- `tests/e2e/stub-server.ts`: the mode union and literals: `'nw-ok'` → `'oc-ok'` etc. (the `\bnw-` rule does this), and the comment "The same stub over the generated site … for the Oculus gates".
- `app/components/oc/OcNav.vue`: `aria-label="Nightwatch"` and the brand text stay until Task 4 (allowed by the test).
- Unscoped CSS classes that were `nw-table`, `nw-banner`, `nw-nav` are now `oc-table`, `oc-banner`, `oc-nav`; check `git grep -n "oc-table\|oc-banner\|oc-nav" -- app` matches the templates and the styles.
- Variable names such as `const nw = inject(…)` become `const oc = inject(…)`, and every `nw.overview` use becomes `oc.overview` (`\bnw\b(?=\.)` does this; check the templates).

- [ ] **Step 5: Rename the baselines**

Story ids change from `nightwatch-…` to `oculus-…`, and the mobile baselines from `nightwatch-mobile-…` to `oculus-mobile-…`. Move the existing images so the diff shows renames:

```bash
cd scripts/nexus-web/tests/visual/__screenshots__
for f in nightwatch-*.png; do git mv "$f" "oculus-${f#nightwatch-}"; done
cd -
```

- [ ] **Step 6: Run everything and check the baselines did not change**

```bash
pnpm --dir scripts/nexus-web exec vitest run tests/unit/no-nightwatch-names.test.ts
pnpm --dir scripts/nexus-web typecheck
pnpm --dir scripts/nexus-web test
pnpm --dir scripts/nexus-web build-storybook
pnpm --dir scripts/nexus-web generate
pnpm --dir scripts/nexus-web exec playwright test tests/e2e tests/a11y tests/visual
```

Expected: all PASS with the moved baselines and no `--update-snapshots`: a rename changes no pixel. A failing screenshot means a token or class did not rename: fix it, do not update the baseline.

- [ ] **Step 7: Commit**

```bash
git add -A -- scripts/nexus-web
git commit -m "refactor(oculus): rename the web components, tokens and tests to Oculus" -- scripts/nexus-web
```

---

### Task 4: The Oculus site at `/` (two builds, titles, brand, publish)

**Files:**
- Rename: `scripts/nexus-web/app/pages/nightwatch/` → `app/pages/oculus/`
- Create: `scripts/nexus-web/site-pages.ts`, `scripts/nexus-web/site-pages.test.ts`
- Modify: `scripts/nexus-web/nuxt.config.ts`, `scripts/nexus-web/package.json` (scripts), `scripts/nexus-web/build-www.sh`, `scripts/nexus-web/build-www.test.ts`
- Modify: `app/pages/oculus/*.vue` (titles, index heading), `app/components/oc/OcNav.vue`, `OcShell.vue`, `OcWorkersTable.vue`, `OcRunsTable.vue`, `OcAttentionTable.vue`, `app/pages/oculus/run.vue` and `pages.test.ts` (links), `app/layouts/oculus.test.ts`
- Modify: `tests/e2e/stub-server.ts`, `tests/e2e/serve-stub-cli.ts`, `tests/e2e/oculus.spec.ts`, `tests/a11y/oculus-axe.spec.ts`, `tests/visual/oculus-mobile.spec.ts`, `tests/visual/sidebar-edge*.spec.ts`, `tests/unit/built-oculus.test.ts`, `tests/unit/built-page.test.ts`, `tests/unit/no-nightwatch-names.test.ts`, `lighthouserc.desktop.cjs`, `lighthouserc.mobile.cjs`
- Modify: `/.gitignore` (add `scripts/nexus-web/.output-oculus/`)

**Interfaces:**
- Consumes: Task 3 names.
- Produces: `sitePages(pages: PageLike[], site: Site): void`, `type Site = 'life' | 'oculus'`, `siteOf(env: NodeJS.ProcessEnv): Site` in `site-pages.ts`; build outputs `.output/public` (life) and `.output-oculus/public` (oculus); `startStub({ dir })` unchanged, `startStubForOculus()` now serves `.output-oculus/public`; Oculus routes `/`, `/attention/`, `/runs/`, `/run/`, `/plan/`; nav keys `oculus | attention | runs | plan`; depot paths `$DEPOT/nexus/oculus.d/<stamp>/` and symlink `$DEPOT/nexus/oculus`.

- [ ] **Step 1: Write the failing unit tests for the page split**

`scripts/nexus-web/site-pages.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { siteOf, sitePages, type PageLike } from './site-pages'

const pages = (): PageLike[] => [
  { path: '/', file: '/w/app/pages/index.vue' },
  { path: '/oculus', file: '/w/app/pages/oculus/index.vue' },
  { path: '/oculus/runs', file: '/w/app/pages/oculus/runs.vue' },
  { path: '/oculus/run', file: '/w/app/pages/oculus/run.vue' },
]
describe('sitePages', () => {
  it('life keeps only the Life pages', () => {
    const p = pages(); sitePages(p, 'life')
    expect(p.map((x) => x.path)).toEqual(['/'])
  })
  it('oculus keeps only the Oculus pages and serves them at the root', () => {
    const p = pages(); sitePages(p, 'oculus')
    expect(p.map((x) => x.path)).toEqual(['/', '/runs', '/run'])
  })
  it('a page path that only starts with "oculus" is not cut', () => {
    const p: PageLike[] = [{ path: '/oculusx', file: '/w/app/pages/oculus/x.vue' }]; sitePages(p, 'oculus')
    expect(p[0].path).toBe('/oculusx')
  })
  it('siteOf: oculus only for NEXUS_SITE=oculus, else life', () => {
    expect(siteOf({ NEXUS_SITE: 'oculus' })).toBe('oculus')
    expect(siteOf({})).toBe('life')
    expect(siteOf({ NEXUS_SITE: 'x' })).toBe('life')
  })
})
```

Add `'*.test.ts'` is already in the vitest `include`; nothing to change there.

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --dir scripts/nexus-web exec vitest run site-pages.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `site-pages.ts` and wire it into Nuxt**

`scripts/nexus-web/site-pages.ts`:

```ts
// DGS-599: one Nuxt project, two static sites. life = pazurite.com (the Life Calendar), oculus = oculus.pazurite.com (served at its root).
export type Site = 'life' | 'oculus'
export interface PageLike { path: string; file?: string; children?: PageLike[] }

export const siteOf = (env: NodeJS.ProcessEnv): Site => (env.NEXUS_SITE === 'oculus' ? 'oculus' : 'life')

const isOculus = (p: PageLike): boolean => /[\\/]pages[\\/]oculus[\\/]/.test(p.file ?? '')

/** Keeps only this site's pages (in place, as the pages:extend hook needs). Oculus pages lose their /oculus prefix. */
export function sitePages(pages: PageLike[], site: Site): void {
  for (let i = pages.length - 1; i >= 0; i--) {
    const p = pages[i]
    if (isOculus(p) !== (site === 'oculus')) { pages.splice(i, 1); continue }
    if (site === 'oculus') p.path = p.path.replace(/^\/oculus(?=\/|$)/, '') || '/'
  }
}
```

`scripts/nexus-web/nuxt.config.ts` (keep the existing keys; add these):

```ts
import { siteOf, sitePages } from './site-pages'

const SITE = siteOf(process.env)
const ROUTES = SITE === 'oculus' ? ['/', '/attention/', '/runs/', '/run/', '/plan/'] : ['/']

export default defineNuxtConfig({
  // …existing keys…
  hooks: { 'pages:extend': (pages) => sitePages(pages, SITE) },
  // each site has its own output folder, so both builds can sit side by side for the tests and build-www.sh
  nitro: { output: { dir: SITE === 'oculus' ? '.output-oculus' : '.output' }, prerender: { routes: ROUTES } },
  app: { head: { /* existing */ title: SITE === 'oculus' ? 'DigiSmith Oculus' : 'pazurite' } },
})
```

`/.gitignore`: add `scripts/nexus-web/.output-oculus/` under the existing `.output/` line.

`scripts/nexus-web/package.json` scripts: `"generate": "nuxt generate && NEXUS_SITE=oculus nuxt generate"`; in `test:built`, `e2e`, `a11y`, `perf`, `lhci` replace `nuxt generate` with `pnpm generate`; `test:built` runs `tests/unit/built-page.test.ts tests/unit/built-oculus.test.ts tests/unit/built-storybook.test.ts`.

- [ ] **Step 4: Run the unit test and see it pass**

Run: `pnpm --dir scripts/nexus-web exec vitest run site-pages.test.ts` → PASS.

- [ ] **Step 5: Move the pages and set the names, titles and links**

```bash
git mv scripts/nexus-web/app/pages/nightwatch scripts/nexus-web/app/pages/oculus
```

Page titles (`useHead`): `index.vue` → `'DigiSmith Oculus'`, `attention.vue` → `'Attention · DigiSmith Oculus'`, `runs.vue` → `'Runs · DigiSmith Oculus'`, `run.vue` → `'Run · DigiSmith Oculus'`, `plan.vue` → `'Plan · DigiSmith Oculus'`. `index.vue`: `<OcPageHead title="Oculus" sub="Every herdr agent, what waits on Jack, and the latest work." />` (Task 8 adds the agents section above the existing content).

`OcNav.vue`:

```ts
defineProps<{ attention: number; current: string }>()
const LINKS = [
  { key: 'oculus', to: '/', label: 'Oculus' },
  { key: 'attention', to: '/attention/', label: 'Attention' },
  { key: 'runs', to: '/runs/', label: 'Runs' },
  { key: 'plan', to: '/plan/', label: 'Plan' },
] as const
```

Template: `<nav class="oc-nav" aria-label="Oculus">`, `<div class="brand">Oculus</div>`.

`OcShell.vue` `current`:

```ts
const current = computed(() => {
  const p = route.path
  if (p.startsWith('/attention')) return 'attention'
  if (p.startsWith('/runs')) return 'runs'
  if (p.startsWith('/plan')) return 'plan'
  return 'oculus'
})
```

Links: in `OcWorkersTable.vue`, `OcRunsTable.vue`, `OcAttentionTable.vue`, `app/pages/oculus/run.vue` and `pages.test.ts` replace `/nightwatch/run/` → `/run/`, `/nightwatch/plan/` → `/plan/`, `/nightwatch/runs/` → `/runs/`, `/nightwatch/attention/` → `/attention/`, `/nightwatch/` → `/`. Update `app/layouts/oculus.test.ts` and `app/components/oc/*.test.ts` expectations for the new hrefs, brand and nav keys.

`tests/unit/no-nightwatch-names.test.ts`: change `ALLOWED` to `/nightwatch-watchdog|nightwatch-(run|event|attention|journal)\/v1|no-nightwatch-names/` (paths and titles are gone now) and rename the second test to `'nothing else says nightwatch'`.

- [ ] **Step 6: Point the tests at the Oculus build**

`tests/e2e/stub-server.ts`:

```ts
// The same stub over the generated Oculus site (`.output-oculus/public`). Start mode: oc-ok.
export async function startStubForOculus() {
  const stub = await startStub({ dir: join(import.meta.dirname, '../../.output-oculus/public') })
  await stub.setMode('oc-ok')
  return stub
}
```

`tests/e2e/serve-stub-cli.ts` (Lighthouse needs both sites):

```ts
import { join } from 'node:path'
import { startStub } from './stub-server.ts'

const life = await startStub({ dir: join(import.meta.dirname, '../../.output/public'), port: Number(process.env.STUB_PORT ?? 4390) })
const oculus = await startStub({ dir: join(import.meta.dirname, '../../.output-oculus/public'), port: Number(process.env.STUB_OCULUS_PORT ?? 4391) })
await oculus.setMode('oc-ok')
console.log(`stub listening ${life.url} ${oculus.url}`)
```

Lighthouse configs: `url: ['http://127.0.0.1:4390/', 'http://127.0.0.1:4391/', 'http://127.0.0.1:4391/runs/']`.

In `tests/e2e/oculus.spec.ts`, `tests/a11y/oculus-axe.spec.ts`, `tests/visual/oculus-mobile.spec.ts`, `tests/visual/sidebar-edge.spec.ts`, `tests/visual/sidebar-edge-webkit.spec.ts`: `startStubForNightwatch`/`startStubForOculus` → `startStubForOculus`, and every page path `/nightwatch/…` → the same path without `/nightwatch` (`/nightwatch/` → `/`). Axe `PAGES` become `['/', '/attention/', '/runs/', '/run/?id=builder-20261022T021000-a1b2c3', '/plan/?ticket=DGS-590']`. Mobile baselines keep their names (`oculus-mobile-operations-phone.png` becomes `oculus-mobile-index-phone.png`: rename it with `git mv` and the test name `['index', '/']`).

`tests/unit/built-oculus.test.ts`:

```ts
const OUT = join(__dirname, '../../.output-oculus/public')
const PAGES = [['index.html', 'Oculus'], ['attention/index.html', 'Attention'], ['runs/index.html', 'Runs'], ['run/index.html', 'Run'], ['plan/index.html', 'Plan']] as const
```

and add, in the same `describe.skipIf(!existsSync(OUT))`:

```ts
  it.each(PAGES)('%s carries the DigiSmith Oculus title', (file) => {
    expect(readFileSync(join(OUT, file), 'utf8')).toMatch(/<title>[^<]*DigiSmith Oculus<\/title>/)
  })
  it('the Oculus build has no Life Calendar', () => {
    expect(readFileSync(join(OUT, 'index.html'), 'utf8')).not.toContain('calendar-live')
  })
```

The `run/index.html` check in that file uses `join(OUT, 'run/index.html')`. The API path check becomes `paths.filter(p => p !== '/api/' && !p.startsWith('/api/v1/oculus'))` → `[]`.

`tests/unit/built-page.test.ts` (the Life build): add

```ts
  it('the Life build has no Oculus page and no nightwatch folder', () => {
    expect(existsSync(join(OUT, 'nightwatch'))).toBe(false)
    expect(existsSync(join(OUT, 'runs'))).toBe(false)
    expect(existsSync(join(OUT, 'attention'))).toBe(false)
  })
```

and narrow its API-path check to `p.startsWith('/api/v1/life-calendar') || p === '/api/' || p === '/api'`.

- [ ] **Step 7: Write the failing build-www test**

In `scripts/nexus-web/build-www.test.ts`, change the fake `pnpm` `generate` case so one call makes both outputs:

```sh
  *generate*) mkdir -p "$WEB/.output/public/_nuxt" "$WEB/.output-oculus/public/_nuxt" && echo "<h1>page $STAMP</h1>" > "$WEB/.output/public/index.html" && echo "<h1>oculus $STAMP</h1>" > "$WEB/.output-oculus/public/index.html" && echo x > "$WEB/.output/public/_nuxt/a.js" && echo y > "$WEB/.output-oculus/public/_nuxt/b.js" && { [ -z "$DOTFILE" ] || echo secret > "$WEB/.output/public/$DOTFILE"; } && { [ -z "$OC_DOTFILE" ] || echo secret > "$WEB/.output-oculus/public/$OC_DOTFILE"; } ;;
```

The fake `pnpm` also receives `vitest run …` calls for the built-page checks; add a case that succeeds: `*vitest*) exit 0 ;;`. Add tests:

```ts
  it('builds the Oculus site into oculus.d/<stamp> and points the oculus symlink at it', () => {
    const s = setup()
    const r = run(s, { STAMP: '1', SKIP_STORYBOOK: '1' })
    expect(r.status, r.stderr).toBe(0)
    expect(lstatSync(join(s.depot, 'nexus/oculus')).isSymbolicLink()).toBe(true)
    expect(readlinkSync(join(s.depot, 'nexus/oculus'))).toBe('oculus.d/1')
    expect(readFileSync(join(s.depot, 'nexus/oculus/index.html'), 'utf8')).toContain('oculus 1')
    expect(readFileSync(join(s.depot, 'nexus/www/index.html'), 'utf8')).toContain('page 1')
  })
  it('a second run switches both links and keeps both old builds', () => {
    const s = setup()
    run(s, { STAMP: '1', SKIP_STORYBOOK: '1' }); run(s, { STAMP: '2', SKIP_STORYBOOK: '1' })
    expect(readlinkSync(join(s.depot, 'nexus/oculus'))).toBe('oculus.d/2')
    expect(readdirSync(join(s.depot, 'nexus/oculus.d'))).toHaveLength(2)
  })
  it('refuses a real oculus directory and leaves it alone', () => {
    const s = setup()
    mkdirSync(join(s.depot, 'nexus/oculus'), { recursive: true })
    expect(run(s, { STAMP: '1', SKIP_STORYBOOK: '1' }).status).not.toBe(0)
    expect(lstatSync(join(s.depot, 'nexus/oculus')).isDirectory()).toBe(true)
  })
  it('refuses an Oculus build with a dotfile and does not switch either link', () => {
    const s = setup()
    const r = run(s, { STAMP: '1', SKIP_STORYBOOK: '1', OC_DOTFILE: '.env' })
    expect(r.status).not.toBe(0)
    expect(existsSync(join(s.depot, 'nexus/oculus'))).toBe(false)
    expect(existsSync(join(s.depot, 'nexus/www'))).toBe(false)
  })
  it('replaces the oculus placeholder symlink that caddy-run.sh makes before the first build', () => {
    const s = setup()
    mkdirSync(join(s.depot, 'nexus/oculus.d/empty'), { recursive: true })
    symlinkSync('oculus.d/empty', join(s.depot, 'nexus/oculus'))
    expect(run(s, { STAMP: '1', SKIP_STORYBOOK: '1' }).status).toBe(0)
    expect(readlinkSync(join(s.depot, 'nexus/oculus'))).toBe('oculus.d/1')
  })
```

Run: `pnpm --dir scripts/nexus-web exec vitest run build-www.test.ts` → the new tests FAIL.

- [ ] **Step 8: Publish both sites in `build-www.sh`**

Keep every existing check. Changes:
- After the existing `LINK` check add the same refusal for `OCLINK="$NEXUS/oculus"` (a real directory → exit 1, "move it away first (Jack decides)"), `OCNEW="$NEXUS/oculus.d/$STAMP"`, `mkdir -p "$NEXUS/oculus.d"`, refuse an existing `$OCNEW`.
- `pnpm generate` now builds both; after the existing `built-page.test.ts` line add `(cd "$WEB" && pnpm vitest run tests/unit/built-oculus.test.ts) || { echo "build-www: the built Oculus check failed" >&2; exit 1; }`.
- Copy `"$WEB/.output-oculus/public/."` to `$OCNEW` and run the same dotfile refusal on `$OCNEW` (message names the Oculus build). Do both copies and both checks before any link switch.
- At the end switch both links with the same one-rename pattern: `ln -sfn "oculus.d/$STAMP" "$NEXUS/oculus.next"; mv -fh "$NEXUS/oculus.next" "$OCLINK"`, check `readlink`, and print `build-www: $OCLINK -> oculus.d/$STAMP`.
- Header comment: the script builds the Life page and Storybook (`www`) and the Oculus site (`oculus`); nothing is deleted.

Run: `pnpm --dir scripts/nexus-web exec vitest run build-www.test.ts` → PASS.

- [ ] **Step 9: Make the moved baselines and run the whole gate**

```bash
pnpm --dir scripts/nexus-web exec vitest run
pnpm --dir scripts/nexus-web typecheck
pnpm --dir scripts/nexus-web generate
ls scripts/nexus-web/.output-oculus/public scripts/nexus-web/.output/public
pnpm --dir scripts/nexus-web exec playwright test tests/e2e tests/a11y
pnpm --dir scripts/nexus-web build-storybook
pnpm --dir scripts/nexus-web exec playwright test tests/visual --update-snapshots
git -C scripts/nexus-web diff --stat -- tests/visual/__screenshots__
```

Expected: the Oculus output has `index.html attention run runs plan _nuxt`, the Life output has no `nightwatch`; e2e and a11y PASS; only `oculus-mobile-*`, `oculus-nav--*`, `oculus-shell--*` (brand "Oculus", new links) and `sidebar-edge-*` (brand text) baselines change. Open the changed PNGs and check them.

- [ ] **Step 10: Commit**

```bash
git add -A -- scripts/nexus-web .gitignore
git commit -m "feat(oculus): build Oculus as its own site at the root" -- scripts/nexus-web .gitignore
```

---

### Task 5: Caddy repo files for oculus.pazurite.com (no live change)

**Files:**
- Modify: `scripts/caddy/Caddyfile`
- Modify: `scripts/caddy/caddy-run.sh`
- Modify: `scripts/caddy/test-config.mjs`

**Interfaces:**
- Consumes: the Oculus web root `$DEPOT/nexus/oculus` and placeholder `oculus.d/empty` (Task 4's `build-www.sh` replaces it).
- Produces: env `DIGISMITH_OCULUS_WWW` for Caddy; site block `oculus.pazurite.com`; snippets `(nexus_api)` and `(static_site)`.

- [ ] **Step 1: Write the failing checks in `test-config.mjs`**

Static checks (in the `// ---- Caddyfile` block): replace the host check with

```js
  check('exactly the three host names (no ts.net name)', JSON.stringify(hosts) === JSON.stringify(['oculus.pazurite.com', 'opencode.pazurite.com', 'pazurite.com']), JSON.stringify(hosts))
```

and add after the apex checks:

```js
  const oc = (adapted.apps?.http?.servers ? Object.values(adapted.apps.http.servers).flatMap(s => s.routes ?? []) : []).filter(r => JSON.stringify(r.match ?? []).includes('"oculus.pazurite.com"'))
  const ocJson = JSON.stringify(oc)
  check('oculus route exists', oc.length === 1)
  check('oculus proxies only /api/* to 127.0.0.1:4300 and serves files from DIGISMITH_OCULUS_WWW', (ocJson.match(/reverse_proxy/g) ?? []).length === 1 && ocJson.includes('127.0.0.1:4300') && ocJson.includes('/api/*') && ocJson.includes('file_server') && ocJson.includes('DIGISMITH_OCULUS_WWW'))
  check('no redirect from /nightwatch', !/nightwatch/.test(json))
```

(Collect the routes the same way as `apex` on line 40: `servers.flatMap(s => s.routes ?? []).filter(r => (r.match ?? []).some(m => (m.host ?? []).includes('oculus.pazurite.com')))`; replace the first line of the snippet above with that.)

Runtime checks: next to the `www` fixture build an Oculus root and pass it to Caddy:

```js
  const ocwww = join(tmp, '.digismith-depot-like', 'nexus', 'oculus')
  mkdirSync(join(ocwww, '_nuxt'), { recursive: true })
  writeFileSync(join(ocwww, 'index.html'), '<!doctype html><title>oc</title>' + '<p>padding</p>'.repeat(120))
  writeFileSync(join(ocwww, '_nuxt/oc.abc123.js'), 'console.log(4)\n'.repeat(80))
```

add `DIGISMITH_OCULUS_WWW: ocwww` to the `spawn(CADDY, …)` env, and after the existing `get` checks:

```js
  { const [c, b, h] = await get('oculus.pazurite.com', '/'); check('oculus.pazurite.com/ serves the Oculus page, no-cache', c === 200 && b.includes('<title>oc</title>') && h['cache-control'] === 'no-cache', `got ${c}`) }
  { const [c, , h] = await get('oculus.pazurite.com', '/_nuxt/oc.abc123.js'); check('Oculus hashed asset is immutable', c === 200 && h['cache-control'] === 'public, max-age=31536000, immutable', `got ${c}`) }
  { const [, kb] = await get('oculus.pazurite.com', '/api/v1/oculus/overview', 'jack:whatever'); check('oculus /api/* reaches the API without the Authorization header', kb.startsWith('api-ok /api/v1/oculus/overview') && kb.endsWith('auth-header-seen-by-api=no'), kb) }
  { const [c, b] = await get('pazurite.com', '/'); check('pazurite.com/ still serves the Life page', c === 200 && b.includes('<title>x</title>'), `got ${c}`) }
  { const [c] = await get('pazurite.com', '/nightwatch/'); check('pazurite.com/nightwatch/ is 404 (no redirect)', c === 404, `got ${c}`) }
  { const [c] = await get('oculus.pazurite.com', '/missing.html'); check('an unknown Oculus file is 404', c === 404, `got ${c}`) }
```

`caddy-run.sh` checks: add `DIGISMITH_OCULUS_WWW` to the fake caddy's `grep -E` list, then:

```js
  check('caddy-run.sh gives Caddy the Oculus web root', /DIGISMITH_OCULUS_WWW set/.test(r.stdout), r.stdout)
  check('caddy-run.sh makes oculus a relative symlink to an empty placeholder build folder', lstatSync(join(dep, 'nexus', 'oculus')).isSymbolicLink() && readlinkSync(join(dep, 'nexus', 'oculus')) === 'oculus.d/empty' && statSync(join(dep, 'nexus', 'oculus')).isDirectory())
```

and a fail-closed case next to the existing `www` one: make `nexus/oculus` a dangling symlink (`symlinkSync('oculus.d/missing', join(dep3, 'nexus', 'oculus'))`) and check `caddy-run.sh refuses to start Caddy without an Oculus web root directory` (`status !== 0` and no `started` line). Import `symlinkSync` if the file does not yet.

- [ ] **Step 2: Run and see it fail**

Run: `CADDY_BIN=$HOME/.digismith-depot/bin/caddy node scripts/caddy/test-config.mjs`
Expected: FAIL lines for the three hosts, the oculus route, the Oculus page and the caddy-run Oculus checks.

- [ ] **Step 3: Write the Caddyfile and caddy-run.sh changes**

`scripts/caddy/Caddyfile` (global block and `(opencode_routes)` and `opencode.pazurite.com` unchanged):

```caddyfile
(nexus_api) {
	# Nexus API (DGS-324): the whole /api/* space goes to the API, which names the version. No login for now (tailnet only, read-only; login design: DGS-458).
	handle /api/* {
		reverse_proxy 127.0.0.1:4300 {
			header_up -Authorization
		}
	}
}

(static_site) {
	@hashed path /_nuxt/* /storybook/assets/* /storybook/_nuxt/*
	@notHashed not path /_nuxt/* /storybook/assets/* /storybook/_nuxt/*
	header @hashed Cache-Control "public, max-age=31536000, immutable"
	header @notHashed Cache-Control "no-cache"
	# No `hide .*`: Caddy tests the hide patterns against the whole path, so a web root under a dot-folder (~/.digismith-depot/...) would answer 404 for every file.
	# The web roots only ever hold build output; build-www.sh refuses a build that contains a dotfile.
	file_server
}

oculus.pazurite.com {
	tls {
		dns cloudflare {env.CLOUDFLARE_API_TOKEN}
	}
	encode zstd gzip
	import nexus_api
	# Oculus (DGS-599): its own static build at the root of this host.
	handle {
		root * {env.DIGISMITH_OCULUS_WWW}
		import static_site
	}
}

pazurite.com {
	tls {
		dns cloudflare {env.CLOUDFLARE_API_TOKEN}
	}
	encode zstd gzip
	import nexus_api
	# The life dashboard (DGS-481): static files from the depot. /storybook/ is the Storybook build next to the page. No CDN for now.
	handle {
		root * {env.DIGISMITH_WWW}
		import static_site
	}
}
```

`scripts/caddy/caddy-run.sh`, after the `DIGISMITH_WWW` lines:

```sh
export DIGISMITH_OCULUS_WWW="$D/nexus/oculus"   # DGS-599: the Oculus site (oculus.pazurite.com); build-www.sh points it at a build folder
[ -e "$DIGISMITH_OCULUS_WWW" ] || { mkdir -p "$D/nexus/oculus.d/empty" && ln -s oculus.d/empty "$DIGISMITH_OCULUS_WWW"; }
[ -n "$DIGISMITH_OCULUS_WWW" ] && [ -d "$DIGISMITH_OCULUS_WWW" ] || { echo "caddy-run: the Oculus web root is missing or not a directory: $DIGISMITH_OCULUS_WWW" >&2; exit 1; }   # fail closed
```

- [ ] **Step 4: Run and see it pass**

Run: `CADDY_BIN=$HOME/.digismith-depot/bin/caddy node scripts/caddy/test-config.mjs`
Expected: every line PASS, exit 0. The depot copy stays as it was: `diff scripts/caddy/Caddyfile ~/.digismith-depot/caddy/Caddyfile` shows the new blocks on the repo side only. Do NOT copy, install or restart anything.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(oculus): add the oculus.pazurite.com Caddy block and web root" -- scripts/caddy/Caddyfile scripts/caddy/caddy-run.sh scripts/caddy/test-config.mjs
```

---

### Task 6: `dg oculus view live` (herdr, allowlist, role, project, run join)

**Files:**
- Create: `packages/cli/src/oculus/live.ts`
- Create: `packages/cli/src/oculus/live.test.ts`
- Modify: `packages/cli/src/oculus/index.ts`, `packages/cli/src/oculus/views.ts:22` (`VIEW_NAMES`), `packages/cli/src/oculus/index.test.ts`, `packages/cli/src/oculus/README.md`, `packages/cli/src/strip-types.smoke.test.ts`

**Interfaces:**
- Consumes: `depotDir(env)`, `isSafe(name)` from `../run/paths.ts`; `listRuns(env): RunRow[]` from `../run/read.ts` (`RunRow = { record: RunRecord; summary: { ended: boolean; … } }`, `record.herdr.pane`, `record.created_at`).
- Produces (Task 7 relies on the JSON shape):

```ts
export const HERDR_ARGS = ["--session", "default", "agent", "list"] as const;
export const AGENT_STATUSES = ["working", "idle", "blocked", "done", "unknown"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];
export type AgentRole = "maestro" | "conductor" | "builder" | "reviewer" | "scout" | "other";
export interface LiveAgent { name: string | null; pane: string; tab: string | null; workspace: string | null; role: AgentRole; project: string | null; status: AgentStatus; run: string | null }
export interface LiveView { readAt: string; herdr: "ok" | "unreachable"; agents: LiveAgent[] }
export type HerdrCall = () => { ok: true; stdout: string } | { ok: false };
export function realHerdr(): HerdrCall;
export function roleOf(name: string | null, maestros: ReadonlySet<string>): AgentRole;
export function projectOf(cwd: unknown, home: string): string | null;
export function maestroNames(env: NodeJS.ProcessEnv): Set<string>;
export function liveView(env: NodeJS.ProcessEnv, now: Date, herdr: HerdrCall, home?: string): LiveView;
```

and in `index.ts`: `export interface OculusDeps { herdr?: HerdrCall }`, `runOculus(argv, env, now, deps: OculusDeps = {})`.

- [ ] **Step 1: Write the failing tests**

`packages/cli/src/oculus/live.test.ts`:

```ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeDepot, type Depot } from "./fixture.test-util.ts";
import { HERDR_ARGS, liveView, maestroNames, projectOf, realHerdr, roleOf, type HerdrCall } from "./live.ts";
import { runOculus } from "./index.ts";

const NOW = new Date("2026-10-24T08:00:00.000Z");
const HOME = "/Users/jack";
const SECRET_TITLE = "TOP-SECRET-TITLE-do-not-show";
const agent = (o: Record<string, unknown>) => ({
  agent: "claude", agent_session: { value: "sess-1" }, agent_status: "idle", cwd: `${HOME}/Workspace/Jazurite/DigiSmith`, focused: false,
  foreground_cwd: `${HOME}/Workspace/Jazurite/DigiSmith`, pane_id: "w2:p1", tab_id: "w2:t1", terminal_title: SECRET_TITLE, terminal_title_stripped: SECRET_TITLE, workspace_id: "w2", ...o,
});
const herdrOf = (agents: object[]): HerdrCall => () => ({ ok: true, stdout: JSON.stringify({ id: "1", result: { type: "agent_list", agents } }) });

let d: Depot;
beforeEach(() => { d = makeDepot(); });
afterEach(() => d.cleanup());

describe("roleOf (same rule as DGS-598)", () => {
  const m = new Set(["digismith-maestro"]);
  it.each([
    ["digismith-maestro", "maestro"], ["digismith-conductor", "conductor"], ["dgs-599", "builder"], ["EMKT-12", "builder"],
    ["dgs-599-rev1", "reviewer"], ["rev-dgs-599", "other"], ["dgs-599-scout", "scout"], ["probe-408", "scout"], ["shell", "other"], [null, "other"],
  ] as const)("%s -> %s", (name, role) => expect(roleOf(name, m)).toBe(role));
});

describe("projectOf", () => {
  it("takes the project folder under ~/Workspace/<org>/", () => {
    expect(projectOf(`${HOME}/Workspace/Jazurite/DigiSmith`, HOME)).toBe("DigiSmith");
    expect(projectOf(`${HOME}/Workspace/Jazurite/DigiSmith/.worktrees/dgs-599/scripts`, HOME)).toBe("DigiSmith");
    expect(projectOf(`${HOME}/Workspace/Jazurite/shoppable-video`, HOME)).toBe("shoppable-video");
  });
  it("gives null outside it, for a bare org folder, or for a value that is not a string", () => {
    expect(projectOf(`${HOME}/Downloads`, HOME)).toBeNull();
    expect(projectOf(`${HOME}/Workspace/Jazurite`, HOME)).toBeNull();
    expect(projectOf("/tmp/x", HOME)).toBeNull();
    expect(projectOf(42, HOME)).toBeNull();
  });
});

describe("maestroNames", () => {
  it("reads the identity cards with role: maestro", () => {
    mkdirSync(join(d.dir, "identities"));
    writeFileSync(join(d.dir, "identities", "a.yml"), "id: digismith-maestro\nrole: maestro\n");
    writeFileSync(join(d.dir, "identities", "b.yml"), "id: something-else\nrole: conductor\n");
    expect([...maestroNames(d.env)]).toEqual(["digismith-maestro"]);
  });
  it("is empty without an identities folder", () => expect(maestroNames(d.env).size).toBe(0));
});

describe("liveView", () => {
  it("lists every agent of every workspace with only the allowed fields", () => {
    const v = liveView(d.env, NOW, herdrOf([
      agent({ name: "dgs-599", agent_status: "working", pane_id: "w2:p5", tab_id: "w2:t5" }),
      agent({ name: "emma-conductor", workspace_id: "w3", pane_id: "w3:p1", tab_id: "w3:t1", cwd: `${HOME}/Workspace/Jazurite/Emma` }),
      agent({ name: undefined, workspace_id: "w4", pane_id: "w4:p2", tab_id: "w4:t1", agent_status: "blocked" }),
      agent({ name: "dgs-571", agent_status: "done", pane_id: "w2:p9" }),
      agent({ name: "weird", agent_status: "sleeping", pane_id: "w2:p8" }),
    ]), HOME);
    expect(v.herdr).toBe("ok");
    expect(v.readAt).toBe(NOW.toISOString());
    expect(v.agents.map((a) => [a.name, a.status, a.workspace])).toEqual([
      [null, "blocked", "w4"], ["dgs-599", "working", "w2"], ["emma-conductor", "idle", "w3"], ["weird", "unknown", "w2"], ["dgs-571", "done", "w2"],
    ]);
    expect(v.agents[2]).toEqual({ name: "emma-conductor", pane: "w3:p1", tab: "w3:t1", workspace: "w3", role: "conductor", project: "Emma", status: "idle", run: null });
    const out = JSON.stringify(v);
    expect(out).not.toContain(SECRET_TITLE);
    expect(out).not.toContain(HOME);
    expect(out).not.toContain("sess-1");
  });
  it("drops an agent without a pane id and caps a long name", () => {
    const v = liveView(d.env, NOW, herdrOf([agent({ name: "x", pane_id: undefined }), agent({ name: "n".repeat(200), pane_id: "w2:p3" })]), HOME);
    expect(v.agents).toHaveLength(1);
    expect(v.agents[0].name).toHaveLength(64);
  });
  it("joins the newest open run on the same herdr pane", () => {
    // a run is listed only with an events file; "ended" after the last "started" closes it (run/read.ts summarize)
    const open = (run: string, at: string, ended = false) => {
      const f = join(d.writeRun({ ticket: "DGS-599", run, role: "builder", created_at: at }), "run.json");
      const r = JSON.parse(readFileSync(f, "utf8")); r.herdr.pane = "w2:p5"; writeFileSync(f, JSON.stringify(r));
      d.writeEvents("DGS-599", run, [{ type: "started", ts: at }, ...(ended ? [{ type: "ended", ts: "2026-10-24T07:40:00.000Z" }] : [])]);
    };
    open("builder-old", "2026-10-24T06:00:00.000Z");
    open("builder-new", "2026-10-24T07:00:00.000Z");
    open("builder-ended", "2026-10-24T07:30:00.000Z", true);
    const v = liveView(d.env, NOW, herdrOf([agent({ name: "dgs-599", pane_id: "w2:p5" }), agent({ name: "dgs-600", pane_id: "w2:p6" })]), HOME);
    expect(v.agents.find((a) => a.name === "dgs-599")?.run).toBe("builder-new");
    expect(v.agents.find((a) => a.name === "dgs-600")?.run).toBeNull();
  });
  it("says unreachable, with no agents, when herdr fails or answers something else", () => {
    for (const h of [() => ({ ok: false as const }), () => ({ ok: true as const, stdout: "not json" }), () => ({ ok: true as const, stdout: "{\"result\":{}}" })]) {
      expect(liveView(d.env, NOW, h, HOME)).toEqual({ readAt: NOW.toISOString(), herdr: "unreachable", agents: [] });
    }
  });
});

describe("the herdr call", () => {
  it("uses exactly the read-only argv", () => expect([...HERDR_ARGS]).toEqual(["--session", "default", "agent", "list"]));
  it("realHerdr only builds the call; the tests never run the real herdr", () => expect(typeof realHerdr()).toBe("function"));
});

describe("runOculus view live", () => {
  it("prints the live view, exit 0, also when herdr is unreachable", () => {
    const ok = runOculus(["view", "live"], d.env, NOW, { herdr: herdrOf([agent({ name: "dgs-599" })]) });
    expect(ok.code).toBe(0);
    expect(JSON.parse(ok.out).agents).toHaveLength(1);
    const down = runOculus(["view", "live"], d.env, NOW, { herdr: () => ({ ok: false }) });
    expect(down.code).toBe(0);
    expect(JSON.parse(down.out).herdr).toBe("unreachable");
  });
  it("takes no flag", () => expect(runOculus(["view", "live", "--run", "x"], d.env, NOW, { herdr: () => ({ ok: false }) }).code).toBe(1));
});
```



- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @digismith/cli exec vitest run src/oculus/live.test.ts` → FAIL (module `./live.ts` not found).

- [ ] **Step 3: Implement `live.ts`**

```ts
// packages/cli/src/oculus/live.ts
// DGS-599: every herdr agent on the Workbox for Oculus. Reads only: one herdr call with a fixed argv, the identity cards, the run records.
// Never reads pane text; drops terminal_title (Claude sets it from the conversation) and the folder path.
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { depotDir, isSafe } from "../run/paths.ts";
import { listRuns } from "../run/read.ts";

export const HERDR_ARGS = ["--session", "default", "agent", "list"] as const;
export const AGENT_STATUSES = ["working", "idle", "blocked", "done", "unknown"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];
export type AgentRole = "maestro" | "conductor" | "builder" | "reviewer" | "scout" | "other";
export interface LiveAgent { name: string | null; pane: string; tab: string | null; workspace: string | null; role: AgentRole; project: string | null; status: AgentStatus; run: string | null }
export interface LiveView { readAt: string; herdr: "ok" | "unreachable"; agents: LiveAgent[] }
export type HerdrCall = () => { ok: true; stdout: string } | { ok: false };

const NAME_MAX = 64;
const ORDER: Record<AgentStatus, number> = { blocked: 0, working: 1, idle: 2, unknown: 3, done: 4 };

/** The real herdr: fixed argv, no shell, 3 s, only HOME, PATH and the XDG_CONFIG_HOME herdr-ws uses. */
export function realHerdr(): HerdrCall {
  const home = os.homedir();
  return () => {
    const r = spawnSync(path.join(home, ".local", "bin", "herdr"), [...HERDR_ARGS], {
      encoding: "utf8", timeout: 3000, killSignal: "SIGKILL", maxBuffer: 4 * 1024 * 1024, shell: false,
      env: { HOME: home, PATH: "/usr/bin:/bin", XDG_CONFIG_HOME: path.join(home, ".config") },
    });
    return r.status === 0 && !r.error ? { ok: true, stdout: r.stdout } : { ok: false };
  };
}

export function roleOf(name: string | null, maestros: ReadonlySet<string>): AgentRole {
  if (!name) return "other";
  if (maestros.has(name)) return "maestro";
  if (/-conductor$/.test(name)) return "conductor";
  if (/-rev/.test(name)) return "reviewer";
  if (/-scout|probe/.test(name)) return "scout";
  if (/^[A-Za-z]+-\d+$/.test(name)) return "builder";
  return "other";
}

export function projectOf(cwd: unknown, home: string): string | null {
  if (typeof cwd !== "string") return null;
  const rel = path.relative(path.join(home, "Workspace"), cwd);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  const parts = rel.split(path.sep);
  return parts.length >= 2 && isSafe(parts[1]) ? parts[1] : null;
}

export function maestroNames(env: NodeJS.ProcessEnv): Set<string> {
  const dir = path.join(depotDir(env), "identities");
  const out = new Set<string>();
  let files: string[];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".yml")); } catch { return out; }
  for (const f of files) {
    let text: string;
    try { text = fs.readFileSync(path.join(dir, f), "utf8"); } catch { continue; }
    const id = /^id:\s*(\S+)\s*$/m.exec(text)?.[1];
    if (id && /^role:\s*maestro\s*$/m.test(text)) out.add(id);
  }
  return out;
}

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

function runsByPane(env: NodeJS.ProcessEnv): Map<string, string> {
  const best = new Map<string, { run: string; at: string }>();
  for (const { record, summary } of listRuns(env)) {
    const pane = record.herdr?.pane;
    if (!pane || summary.ended) continue;
    const prev = best.get(pane);
    if (!prev || record.created_at > prev.at) best.set(pane, { run: record.run, at: record.created_at });
  }
  return new Map([...best].map(([k, v]) => [k, v.run]));
}

export function liveView(env: NodeJS.ProcessEnv, now: Date, herdr: HerdrCall, home: string = os.homedir()): LiveView {
  const readAt = now.toISOString();
  const down: LiveView = { readAt, herdr: "unreachable", agents: [] };
  const r = herdr();
  if (!r.ok) return down;
  let raw: unknown;
  try { raw = (JSON.parse(r.stdout) as { result?: { agents?: unknown } }).result?.agents; } catch { return down; }
  if (!Array.isArray(raw)) return down;
  const maestros = maestroNames(env);
  const runs = runsByPane(env);
  const agents: LiveAgent[] = [];
  for (const a of raw as Record<string, unknown>[]) {
    const pane = str(a?.pane_id);
    if (!pane) continue;
    const name = str(a.name)?.slice(0, NAME_MAX) ?? null;
    const status = (AGENT_STATUSES as readonly string[]).includes(a.agent_status as string) ? (a.agent_status as AgentStatus) : "unknown";
    agents.push({ name, pane, tab: str(a.tab_id), workspace: str(a.workspace_id), role: roleOf(name, maestros), project: projectOf(a.cwd, home), status, run: runs.get(pane) ?? null });
  }
  agents.sort((x, y) => ORDER[x.status] - ORDER[y.status] || (x.workspace ?? "~").localeCompare(y.workspace ?? "~") || (x.name ?? "~").localeCompare(y.name ?? "~") || x.pane.localeCompare(y.pane));
  return { readAt, herdr: "ok", agents };
}
```

`index.ts`: `import { liveView, realHerdr, type HerdrCall } from "./live.ts";`, `export interface OculusDeps { herdr?: HerdrCall }`, signature `runOculus(argv: string[], env: NodeJS.ProcessEnv, now: Date, deps: OculusDeps = {})`, and before the `switch`:

```ts
  if (name === "live") {
    if (Object.keys(f).length > 0) return fail("live takes no flag");
    return ok(liveView(env, now, deps.herdr ?? realHerdr()));
  }
```

`views.ts`: `export const VIEW_NAMES = ["overview", "attention", "runs", "run", "events", "plan", "live"] as const;`. README: one paragraph on the live view (fixed argv, allowlist, no pane text, exit 0 with `herdr: "unreachable"`).

`strip-types.smoke.test.ts`: add `live.ts` is stripped by the existing loop over every file (check the loop covers `src/oculus/`); no new case.

- [ ] **Step 4: Run and see them pass**

Run: `pnpm --filter @digismith/cli exec vitest run src/oculus src/strip-types.smoke.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(oculus): add the read-only live view of every herdr agent" -- packages/cli/src/oculus packages/cli/src/strip-types.smoke.test.ts
```

---

### Task 7: `/api/v1/oculus/live` and the last good snapshot

**Files:**
- Create: `scripts/nexus-api/src/oculus-snapshot.ts`, `scripts/nexus-api/src/oculus-snapshot.test.ts`
- Modify: `scripts/nexus-shared/oculus.ts` (live schemas), `scripts/nexus-api/src/oculus-route.ts`, `scripts/nexus-api/src/oculus-route.test.ts`, `scripts/nexus-api/src/oculus-reader.ts` (`ViewName`), `scripts/nexus-api/src/server.ts`, `scripts/nexus-api/src/oculus-contract.test.ts`

**Interfaces:**
- Consumes: the CLI JSON `{ readAt, herdr: "ok" | "unreachable", agents: LiveAgent[] }` from Task 6.
- Produces (shared schema, used by Task 8):

```ts
export const AGENT_STATUSES = ['working', 'idle', 'blocked', 'done', 'unknown'] as const
export const AGENT_ROLES = ['maestro', 'conductor', 'builder', 'reviewer', 'scout', 'other'] as const
export const liveAgentSchema = z.strictObject({ name: z.string().nullable(), pane: z.string(), tab: z.string().nullable(), workspace: z.string().nullable(), role: z.enum(AGENT_ROLES), project: z.string().nullable(), status: z.enum(AGENT_STATUSES), run: z.string().nullable() })
export type LiveAgent = z.infer<typeof liveAgentSchema>
export const liveViewSchema = z.strictObject({ readAt: iso, herdr: z.enum(['ok', 'unreachable']), agents: z.array(liveAgentSchema) })   // the CLI view
export const liveSnapshotSchema = z.strictObject({ asOf: iso, agents: z.array(liveAgentSchema) })   // the depot file
export const liveSchema = z.strictObject({ readAt: iso, herdr: z.strictObject({ state: z.enum(['connected', 'disconnected']), asOf: iso.nullable() }), agents: z.array(liveAgentSchema) })   // the API answer
export type Live = z.infer<typeof liveSchema>
```

- Produces: `createSnapshotStore(dir: string, opts?: { webRoots?: string[] }): SnapshotStore`, `SnapshotStore { save(s: { asOf: string; agents: LiveAgent[] }): boolean; load(): { asOf: string; agents: LiveAgent[] } | null }`, `snapshotDir(depot: string): string`, `webRootsOf(depot: string): string[]`; `OculusDeps.snapshot?: SnapshotStore`; `NexusOptions.depot?: string`.

- [ ] **Step 1: Write the failing snapshot tests**

`scripts/nexus-api/src/oculus-snapshot.test.ts`:

```ts
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSnapshotStore, snapshotDir, webRootsOf } from './oculus-snapshot.ts'

const agent = { name: 'dgs-599', pane: 'w2:p5', tab: 'w2:t5', workspace: 'w2', role: 'builder', project: 'DigiSmith', status: 'working', run: null } as const
const depot = () => {
  const d = mkdtempSync(join(tmpdir(), 'oc-snap-'))
  mkdirSync(join(d, 'nexus', 'www.d', '1'), { recursive: true }); symlinkSync('www.d/1', join(d, 'nexus', 'www'))
  mkdirSync(join(d, 'nexus', 'oculus.d', '1'), { recursive: true }); symlinkSync('oculus.d/1', join(d, 'nexus', 'oculus'))
  return d
}
const under = (child: string, parent: string) => (child + sep).startsWith(parent + sep)

describe('snapshot store', () => {
  it('saves atomically to nexus/state/oculus-live-last.json with folder 700 and file 600, and loads it back', () => {
    const d = depot(); const s = createSnapshotStore(snapshotDir(d), { webRoots: webRootsOf(d) })
    expect(s.save({ asOf: '2026-10-24T08:00:00.000Z', agents: [agent] })).toBe(true)
    const file = join(d, 'nexus', 'state', 'oculus-live-last.json')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ asOf: '2026-10-24T08:00:00.000Z', agents: [agent] })
    expect(statSync(join(d, 'nexus', 'state')).mode & 0o777).toBe(0o700)
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(s.load()).toEqual({ asOf: '2026-10-24T08:00:00.000Z', agents: [agent] })
  })
  it('the snapshot path is under neither web root (real paths)', () => {
    const d = depot()
    const dir = snapshotDir(d); mkdirSync(dir, { recursive: true })
    for (const root of webRootsOf(d)) expect(under(realpathSync(dir), realpathSync(root))).toBe(false)
  })
  it('refuses a folder inside a web root: saves nothing, loads nothing', () => {
    const d = depot(); const inside = join(d, 'nexus', 'oculus', 'state')
    const s = createSnapshotStore(inside, { webRoots: webRootsOf(d) })
    expect(s.save({ asOf: '2026-10-24T08:00:00.000Z', agents: [agent] })).toBe(false)
    expect(s.load()).toBeNull()
  })
  it('a missing or broken file loads as null', () => {
    const d = depot(); const s = createSnapshotStore(snapshotDir(d), { webRoots: webRootsOf(d) })
    expect(s.load()).toBeNull()
    mkdirSync(snapshotDir(d), { recursive: true }); writeFileSync(join(snapshotDir(d), 'oculus-live-last.json'), '{"asOf":1}')
    expect(s.load()).toBeNull()
  })
  it('never writes a field outside the schema', () => {
    const d = depot(); const s = createSnapshotStore(snapshotDir(d), { webRoots: webRootsOf(d) })
    expect(s.save({ asOf: '2026-10-24T08:00:00.000Z', agents: [{ ...agent, terminal_title: 'x' } as never] })).toBe(false)
  })
})
```

- [ ] **Step 2: Write the failing route tests**

Append to `scripts/nexus-api/src/oculus-route.test.ts`:

```ts
describe('GET /api/v1/oculus/live (DGS-599)', () => {
  const agent = { name: 'dgs-599', pane: 'w2:p5', tab: 'w2:t5', workspace: 'w2', role: 'builder', project: 'DigiSmith', status: 'working', run: null }
  const mem = () => { let v: { asOf: string; agents: unknown[] } | null = null; let saves = 0; return { save: (s: { asOf: string; agents: unknown[] }) => { v = s; saves++; return true }, load: () => v as never, saves: () => saves } }
  const liveApp = (read: Reader, snapshot = mem()) => { const a = new Hono<Env>(); a.route('/', createOculusRoutes({ read, now: () => NOW, snapshot: snapshot as never })); return { a, snapshot } }

  it('connected: answers the agents and saves the snapshot once per readAt', async () => {
    const { a, snapshot } = liveApp(async () => ({ readAt: '2026-10-22T03:00:00.000Z', herdr: 'ok', agents: [agent] }))
    const r = await a.request('/api/v1/oculus/live')
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ readAt: '2026-10-22T03:00:00.000Z', herdr: { state: 'connected', asOf: '2026-10-22T03:00:00.000Z' }, agents: [agent] })
    await a.request('/api/v1/oculus/live')
    expect(snapshot.saves()).toBe(1)
  })
  it('herdr unreachable: 200 with the last snapshot and its time', async () => {
    const snap = mem(); snap.save({ asOf: '2026-10-22T02:30:00.000Z', agents: [agent] })
    const { a } = liveApp(async () => ({ readAt: '2026-10-22T03:00:00.000Z', herdr: 'unreachable', agents: [] }), snap)
    expect(await (await a.request('/api/v1/oculus/live')).json()).toEqual({ readAt: '2026-10-22T03:00:00.000Z', herdr: { state: 'disconnected', asOf: '2026-10-22T02:30:00.000Z' }, agents: [agent] })
  })
  it('reader failure: the same disconnected answer; no snapshot yet: no agents and asOf null', async () => {
    const { a } = liveApp(async () => { throw new ReaderError('reader_unavailable') })
    const r = await a.request('/api/v1/oculus/live')
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ readAt: new Date(NOW).toISOString(), herdr: { state: 'disconnected', asOf: null }, agents: [] })
  })
  it('an answer that does not fit the schema counts as disconnected and is never saved', async () => {
    const { a, snapshot } = liveApp(async () => ({ readAt: '2026-10-22T03:00:00.000Z', herdr: 'ok', agents: [{ ...agent, terminal_title: 'secret' }] }))
    const body = await (await a.request('/api/v1/oculus/live')).json()
    expect(body.herdr.state).toBe('disconnected')
    expect(JSON.stringify(body)).not.toContain('secret')
    expect(snapshot.saves()).toBe(0)
  })
  it('400 on any query, 405 on POST', async () => {
    const { a } = liveApp(async () => ({ readAt: '2026-10-22T03:00:00.000Z', herdr: 'ok', agents: [] }))
    expect((await a.request('/api/v1/oculus/live?x=1')).status).toBe(400)
    expect((await a.request('/api/v1/oculus/live', { method: 'POST' })).status).toBe(405)
  })
})
```

In `oculus-contract.test.ts` add a case that `liveSchema` parses the connected and disconnected examples above and rejects an agent with an extra field.

- [ ] **Step 3: Run them and see them fail**

Run: `pnpm vitest run scripts/nexus-api/src/oculus-snapshot.test.ts scripts/nexus-api/src/oculus-route.test.ts scripts/nexus-api/src/oculus-contract.test.ts` → FAIL.

- [ ] **Step 4: Implement the schema, the store and the route**

Add the schemas from "Produces" to `scripts/nexus-shared/oculus.ts`.

`scripts/nexus-api/src/oculus-snapshot.ts`:

```ts
// scripts/nexus-api/src/oculus-snapshot.ts
// DGS-599: the last good herdr agent list, so Oculus can show it (marked disconnected) during a herdr outage, also on a fresh page load.
// Lives in $DEPOT/nexus/state/, never under a web root (nexus/www, nexus/oculus are what Caddy serves and build-www.sh switches).
import { chmodSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { liveSnapshotSchema, type LiveAgent } from '../../nexus-shared/oculus.ts'

export interface Snapshot { asOf: string; agents: LiveAgent[] }
export interface SnapshotStore { save(s: Snapshot): boolean; load(): Snapshot | null }

const FILE = 'oculus-live-last.json'
export const snapshotDir = (depot: string): string => join(depot, 'nexus', 'state')
export const webRootsOf = (depot: string): string[] => [join(depot, 'nexus', 'www'), join(depot, 'nexus', 'oculus')]

// the nearest existing folder, resolved, so a symlinked web root cannot hide a path inside it
function real(p: string): string {
  let cur = resolve(p); const rest: string[] = []
  for (;;) {
    try { return join(realpathSync(cur), ...rest.reverse()) } catch { /* not there yet */ }
    const up = dirname(cur); if (up === cur) return resolve(p)
    rest.push(cur.slice(up.length + 1)); cur = up
  }
}
const inside = (child: string, parent: string): boolean => (child + sep).startsWith(parent + sep)

export function createSnapshotStore(dir: string, opts: { webRoots?: string[] } = {}): SnapshotStore {
  const blocked = (opts.webRoots ?? []).some((r) => inside(real(dir), real(r)))
  const file = join(dir, FILE)
  return {
    save(s) {
      if (blocked) return false
      const parsed = liveSnapshotSchema.safeParse(s)
      if (!parsed.success) return false
      try {
        mkdirSync(dir, { recursive: true, mode: 0o700 }); chmodSync(dir, 0o700)
        const tmp = `${file}.${process.pid}.tmp`
        writeFileSync(tmp, JSON.stringify(parsed.data), { mode: 0o600 })
        renameSync(tmp, file)
        return true
      } catch { return false }
    },
    load() {
      if (blocked) return null
      try { const p = liveSnapshotSchema.safeParse(JSON.parse(readFileSync(file, 'utf8'))); return p.success ? p.data : null } catch { return null }
    },
  }
}
```

`oculus-reader.ts`: `export type ViewName = 'overview' | 'attention' | 'runs' | 'run' | 'events' | 'plan' | 'live'`.

`oculus-route.ts`: import `liveSchema`, `liveViewSchema` and `type SnapshotStore`; `OculusDeps { read: Reader; jobs?: () => JobInfo[]; now?: () => number; snapshot?: SnapshotStore }`; add `live` to `KNOWN_PATH` (`(overview|attention|live|runs|…)`); the route:

```ts
  let lastSaved: string | null = null
  app.get(`${OCULUS_PATH}/live`, async (c) => {
    if (!none.safeParse(query(c)).success) return fail(c, 400, 'bad_request')
    let view: unknown = null
    try { view = await deps.read('live', {}) } catch { view = null }
    const v = liveViewSchema.safeParse(view)
    if (v.success && v.data.herdr === 'ok') {
      if (deps.snapshot && lastSaved !== v.data.readAt) {
        if (deps.snapshot.save({ asOf: v.data.readAt, agents: v.data.agents })) lastSaved = v.data.readAt
        else c.set('errorCode', 'snapshot_write_failed')   // logged as a code; the answer still goes out
      }
      return sendJson(c, 200, liveSchema.parse({ readAt: v.data.readAt, herdr: { state: 'connected', asOf: v.data.readAt }, agents: v.data.agents }))
    }
    const snap = deps.snapshot?.load() ?? null
    const readAt = v.success ? v.data.readAt : new Date(now()).toISOString()
    return sendJson(c, 200, liveSchema.parse({ readAt, herdr: { state: 'disconnected', asOf: snap?.asOf ?? null }, agents: snap?.agents ?? [] }))
  })
```

`server.ts`: `NexusOptions` gains `depot?: string`; in `startNexus`:

```ts
  const depot = opts.depot ?? join(homedir(), '.digismith-depot')
  const oculus = { read: createReader(), snapshot: createSnapshotStore(snapshotDir(depot), { webRoots: webRootsOf(depot) }), ...(eng ? { jobs: () => eng.snapshot() } : {}) }
```

and the entry point passes `depot` into `startNexus({ …, depot })`. Import `createSnapshotStore, snapshotDir, webRootsOf` from `./oculus-snapshot.ts` (and `homedir` if not imported).

- [ ] **Step 5: Run and see them pass**

Run: `pnpm vitest run scripts/nexus-api` → PASS (the whole API suite, including `no-secret-in-logs` and `no-console`).

- [ ] **Step 6: Commit**

```bash
git add -- scripts/nexus-api/src/oculus-snapshot.ts scripts/nexus-api/src/oculus-snapshot.test.ts
git commit -m "feat(oculus): serve the live agent list with a last good snapshot" -- scripts/nexus-api/src scripts/nexus-shared/oculus.ts
```

---

### Task 8: The Oculus index page (agents, attention summary, top bar, disconnected state)

**Files:**
- Create: `scripts/nexus-web/app/components/oc/OcAgentStatus.vue` (+ `.stories.ts`)
- Create: `scripts/nexus-web/app/components/oc/OcAgentsTable.vue` (+ `.stories.ts`)
- Create: `scripts/nexus-web/app/components/oc/OcAgentFilters.vue` (+ `.stories.ts`)
- Create: `scripts/nexus-web/app/components/oc/OcDisconnectedBanner.vue` (+ `.stories.ts`)
- Create: `scripts/nexus-web/app/components/oc/OcAttentionSummary.vue` (+ `.stories.ts`)
- Create: `scripts/nexus-web/app/utils/agent-changes.ts`, `agent-changes.test.ts`, `scripts/nexus-web/app/utils/agent-filter.ts`, `agent-filter.test.ts`
- Create: `scripts/nexus-web/app/components/oc/agents.test.ts`
- Modify: `app/composables/oculus-api.ts` (+test), `app/layouts/oculus.vue`, `app/components/oc/OcTopBar.vue` (+stories), `app/components/oc/OcNav.vue` (+stories), `app/components/oc/OcShell.vue`, `app/pages/oculus/index.vue`, `tests/oculus-fixtures.ts`, `tests/e2e/stub-server.ts`, `tests/e2e/oculus.spec.ts`, `tests/a11y/oculus-axe.spec.ts`, `tests/visual/oculus-mobile.spec.ts`, `tests/unit/built-oculus.test.ts`

**Interfaces:**
- Consumes: `liveSchema`, `Live`, `LiveAgent`, `AGENT_STATUSES`, `AGENT_ROLES` from `#oculus-schema` (Task 7); `/api/v1/oculus/live`.
- Produces: `loadLive(o?: ApiOptions): Promise<Live>`; `agentChanges(prev: Live | null, next: Live): string`; `filterAgents(agents: LiveAgent[], f: AgentFilter): LiveAgent[]`, `type AgentFilter = { status: string; role: string; project: string; workspace: string }`; layout provide key `'ocLive'` → `{ live: Ref<Live | null>; stale: Ref<boolean>; refresh: () => Promise<void> }`; `OcTopBar` new props `live: Live | null`; `OcNav` new prop `blocked: number`; stub modes `oc-herdr-down` and `oc-herdr-down-fresh`.

- [ ] **Step 1: Fixtures and stub**

`tests/oculus-fixtures.ts`, add:

```ts
// DGS-599: herdr agents across three workspaces, every status, one unnamed agent, one run link. No terminal title anywhere.
export function liveFixture(): Live {
  const a = (name: string | null, pane: string, workspace: string, role: LiveAgent['role'], project: string | null, status: LiveAgent['status'], run: string | null = null): LiveAgent => ({ name, pane, tab: `${workspace}:t${pane.split(':p')[1]}`, workspace, role, project, status, run })
  return {
    readAt: '2026-10-22T03:00:00.000Z', herdr: { state: 'connected', asOf: '2026-10-22T03:00:00.000Z' },
    agents: [
      a('dgs-601', 'w2:p7', 'w2', 'builder', 'DigiSmith', 'blocked'),
      a('dgs-590', 'w2:p5', 'w2', 'builder', 'DigiSmith', 'working', 'builder-20261022T021000-a1b2c3'),
      a('dgs-590-rev1', 'w2:p6', 'w2', 'reviewer', 'DigiSmith', 'working'),
      a('digismith-conductor', 'w2:p1', 'w2', 'conductor', 'DigiSmith', 'idle'),
      a('emma-conductor', 'w3:p1', 'w3', 'conductor', 'Emma', 'idle'),
      a(null, 'w4:p2', 'w4', 'other', null, 'unknown'),
      a('dgs-571', 'w2:p9', 'w2', 'builder', 'shoppable-video', 'done'),
    ],
  }
}
```

(import `Live`, `LiveAgent` from `#oculus-schema` or the relative `../../nexus-shared/oculus.ts` the file already uses.)

`tests/e2e/stub-server.ts`: `OcMode` gains `'oc-herdr-down' | 'oc-herdr-down-fresh'`; the fake reader's `live` case: `oc-herdr-down*` → `{ readAt, herdr: 'unreachable', agents: [] }`, `oc-empty` → `{ readAt, herdr: 'ok', agents: [] }`, else `{ readAt: liveFixture().readAt, herdr: 'ok', agents: liveFixture().agents }`. Give the app a memory snapshot store, prefilled with `{ asOf: '2026-10-22T02:20:00.000Z', agents: liveFixture().agents }`, that `oc-herdr-down-fresh` replaces with an empty store (`load()` → `null`):

```ts
const snapStore = () => { let v: { asOf: string; agents: LiveAgent[] } | null = { asOf: '2026-10-22T02:20:00.000Z', agents: liveFixture().agents }; return { save: (s: { asOf: string; agents: LiveAgent[] }) => { v = s; return true }, load: () => (mode === 'oc-herdr-down-fresh' ? null : v) } }
```

(In connected modes the route saves `readAt` `03:00`; the disconnected tests set the mode before the first page load, so the prefilled `02:20` snapshot is what shows. Reset it in `setMode` by re-creating the store when the mode changes.)

- [ ] **Step 2: Write the failing unit tests**

`app/utils/agent-changes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { agentChanges } from './agent-changes'
import { liveFixture } from '../../tests/oculus-fixtures'

const live = liveFixture()
const without = (name: string) => ({ ...live, agents: live.agents.filter((a) => a.name !== name) })
describe('agentChanges: sets of names, never the whole table', () => {
  it('says nothing on the first answer or when nothing changed', () => {
    expect(agentChanges(null, live)).toBe('')
    expect(agentChanges(live, live)).toBe('')
  })
  it('names new, gone and newly blocked agents', () => {
    const next = { ...without('dgs-571'), agents: [...without('dgs-571').agents.map((a) => (a.name === 'dgs-590' ? { ...a, status: 'blocked' as const } : a)), { ...live.agents[0], name: 'dgs-602', pane: 'w2:p10' }] }
    expect(agentChanges(live, next)).toBe('Blocked: dgs-590. New: dgs-602. Gone: dgs-571.')
  })
  it('an unnamed agent is named by its pane', () => {
    expect(agentChanges(live, { ...live, agents: live.agents.filter((a) => a.name !== null) })).toBe('Gone: w4:p2.')
  })
  it('announces the connection change once, before the names', () => {
    const down = { ...live, herdr: { state: 'disconnected' as const, asOf: '2026-10-22T02:20:00.000Z' } }
    expect(agentChanges(live, down)).toBe('Disconnected from herdr.')
    expect(agentChanges(down, down)).toBe('')
    expect(agentChanges(down, live)).toBe('Connected to herdr.')
  })
})
```

`app/utils/agent-filter.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { filterAgents } from './agent-filter'
import { liveFixture } from '../../tests/oculus-fixtures'

const agents = liveFixture().agents
const none = { status: '', role: '', project: '', workspace: '' }
describe('filterAgents', () => {
  it('no filter keeps all, in order', () => expect(filterAgents(agents, none)).toEqual(agents))
  it('each filter narrows, and they combine', () => {
    expect(filterAgents(agents, { ...none, status: 'working' }).map((a) => a.name)).toEqual(['dgs-590', 'dgs-590-rev1'])
    expect(filterAgents(agents, { ...none, role: 'conductor', workspace: 'w3' }).map((a) => a.name)).toEqual(['emma-conductor'])
    expect(filterAgents(agents, { ...none, project: 'shoppable-video' }).map((a) => a.name)).toEqual(['dgs-571'])
  })
})
```

`app/components/oc/agents.test.ts` (mount with `@vue/test-utils`, as `app/components/oc/runs.test.ts` does):

```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OcAgentsTable from './OcAgentsTable.vue'
import OcTopBar from './OcTopBar.vue'
import { liveFixture } from '../../../tests/oculus-fixtures'

const live = liveFixture()
const down = { ...live, herdr: { state: 'disconnected' as const, asOf: '2026-10-22T02:20:00.000Z' } }
describe('OcAgentsTable', () => {
  it('one row per agent, with the role, project, status word, place and run link', () => {
    const w = mount(OcAgentsTable, { props: { agents: live.agents, disconnected: false } })
    expect(w.findAll('tbody tr')).toHaveLength(7)
    expect(w.text()).toContain('unnamed')
    expect(w.find('a[href="/run/?id=builder-20261022T021000-a1b2c3"]').exists()).toBe(true)
    expect(w.find('td[data-label="Where"]').text()).toBe('w2 · t7')
  })
  it('only working is green; disconnected makes every dot neutral and no green at all', () => {
    const on = mount(OcAgentsTable, { props: { agents: live.agents, disconnected: false } })
    expect(on.findAll('.st.ok').map((e) => e.text())).toEqual(['working', 'working'])
    const off = mount(OcAgentsTable, { props: { agents: live.agents, disconnected: true } })
    expect(off.findAll('.st.ok')).toHaveLength(0)
    expect(off.findAll('.st.hollow')).toHaveLength(7)
  })
})
describe('OcTopBar agents count', () => {
  it('shows the counts and links to /#agents', () => {
    const w = mount(OcTopBar, { props: { overview: null, stale: false, updatedAt: null, live } })
    const a = w.find('a[href="/#agents"]')
    expect(a.text().replace(/\s+/g, ' ')).toBe('Agents 7 · working 2 · blocked 1')
  })
  it('disconnected keeps the last count with a marker, never "unknown"', () => {
    const w = mount(OcTopBar, { props: { overview: null, stale: false, updatedAt: null, live: down } })
    expect(w.find('a[href="/#agents"]').text().replace(/\s+/g, ' ')).toBe('Agents 7 · working 2 · blocked 1 · disconnected')
    expect(w.text()).not.toMatch(/Agents unknown/)
  })
})
```

In `app/composables/oculus-api.test.ts` add: `loadLive` calls `/api/v1/oculus/live` and rejects an answer with an extra agent field as `bad_answer` (copy the pattern of the existing `loadOverview` test in that file).

- [ ] **Step 3: Run them and see them fail**

Run: `pnpm --dir scripts/nexus-web exec vitest run app/utils/agent-changes.test.ts app/utils/agent-filter.test.ts app/components/oc/agents.test.ts app/composables/oculus-api.test.ts` → FAIL.

- [ ] **Step 4: Implement the utilities and the API call**

`app/composables/oculus-api.ts`: import `liveSchema`; `export const loadLive = (o: ApiOptions = {}) => get('/live', liveSchema, o)`.

`app/utils/agent-changes.ts`:

```ts
import type { Live, LiveAgent } from '#oculus-schema'

const key = (a: LiveAgent): string => a.name ?? a.pane
/** The polite announcement for one poll: the connection change, then sets of names. Empty when nothing changed or on the first answer. */
export function agentChanges(prev: Live | null, next: Live): string {
  if (!prev) return ''
  if (prev.herdr.state !== next.herdr.state) return next.herdr.state === 'connected' ? 'Connected to herdr.' : 'Disconnected from herdr.'
  if (next.herdr.state === 'disconnected') return ''
  const p = new Map(prev.agents.map((a) => [key(a), a]))
  const n = new Map(next.agents.map((a) => [key(a), a]))
  const blocked = next.agents.filter((a) => a.status === 'blocked' && p.has(key(a)) && p.get(key(a))!.status !== 'blocked').map(key)
  const added = [...n.keys()].filter((k) => !p.has(k))
  const gone = [...p.keys()].filter((k) => !n.has(k))
  return [['Blocked', blocked], ['New', added], ['Gone', gone]].filter(([, l]) => l.length > 0).map(([t, l]) => `${t}: ${(l as string[]).join(', ')}.`).join(' ')
}
```

(A new agent that arrives blocked is named under "New" only.)

`app/utils/agent-filter.ts`:

```ts
import type { LiveAgent } from '#oculus-schema'

export interface AgentFilter { status: string; role: string; project: string; workspace: string }
export const filterAgents = (agents: LiveAgent[], f: AgentFilter): LiveAgent[] =>
  agents.filter((a) => (!f.status || a.status === f.status) && (!f.role || a.role === f.role) && (!f.project || a.project === f.project) && (!f.workspace || a.workspace === f.workspace))
```

- [ ] **Step 5: Implement the components**

`OcAgentStatus.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { LiveAgent } from '#oculus-schema'

const props = defineProps<{ status: LiveAgent['status']; disconnected: boolean }>()
// only working is green; blocked is the bad tone; disconnected turns every dot neutral and hollow (no false green)
const TONE = { working: 'ok', blocked: 'bad', idle: 'info', done: 'muted', unknown: 'neutral' } as const
const tone = computed(() => (props.disconnected ? 'neutral' : TONE[props.status]))
</script>

<template>
  <span class="st" :class="[tone, { hollow: disconnected || status === 'unknown' }]"><i class="dot" aria-hidden="true" />{{ status }}</span>
</template>

<style scoped lang="scss">
.st { font-family: var(--oc-mono); white-space: nowrap; color: var(--oc-text-2); }
.dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; background: var(--oc-neutral); }
.ok { color: var(--oc-ok); } .ok .dot { background: var(--oc-ok); }
.bad { color: var(--oc-bad); } .bad .dot { background: var(--oc-bad); }
.info .dot { background: var(--oc-info); }
.muted { color: var(--oc-text-3); } .muted .dot { background: var(--oc-text-3); }
.hollow .dot { background: transparent; box-shadow: inset 0 0 0 1.5px var(--oc-neutral); }
</style>
```

`OcDisconnectedBanner.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { fmtClock } from '../../utils/oc-format'

const props = defineProps<{ asOf: string | null }>()
const at = computed(() => (props.asOf ? fmtClock(Date.parse(props.asOf)).slice(0, 5) : null))
</script>

<template>
  <!-- not a live region: the page's one polite region announces the change -->
  <p class="oc-disconnected"><template v-if="at">Disconnected from herdr, as of {{ at }} (UTC+7). Retrying.</template><template v-else>Disconnected from herdr. No agent list yet. Retrying.</template></p>
</template>

<style scoped lang="scss">
.oc-disconnected { background: var(--oc-raised); border: 1px solid var(--oc-border); border-left: 3px solid var(--oc-warn); padding: 8px 12px; margin: 0 0 12px; color: var(--oc-text-2); }
</style>
```

`OcAgentsTable.vue`:

```vue
<script setup lang="ts">
import type { LiveAgent } from '#oculus-schema'
import OcAgentStatus from './OcAgentStatus.vue'

defineProps<{ agents: LiveAgent[]; disconnected: boolean }>()
const where = (a: LiveAgent): string => [a.workspace, a.tab?.split(':')[1]].filter(Boolean).join(' · ') || '-'
</script>

<template>
  <OcTable caption="herdr agents">
    <template #head>
      <tr><th scope="col">Agent</th><th scope="col">Role</th><th scope="col">Project</th><th scope="col">Status</th><th scope="col">Where</th><th scope="col">Run</th></tr>
    </template>
    <tr v-for="a in agents" :key="a.pane">
      <td data-label="Agent" class="mono"><template v-if="a.name">{{ a.name }}</template><template v-else><span class="muted">unnamed</span> {{ a.pane }}</template></td>
      <td data-label="Role">{{ a.role }}</td>
      <td data-label="Project">{{ a.project ?? '-' }}</td>
      <td data-label="Status"><OcAgentStatus :status="a.status" :disconnected="disconnected" /></td>
      <td data-label="Where" class="mono">{{ where(a) }}</td>
      <td data-label="Run" class="mono"><NuxtLink v-if="a.run" :to="`/run/?id=${encodeURIComponent(a.run)}`">{{ a.run }}</NuxtLink><template v-else>-</template></td>
    </tr>
  </OcTable>
</template>
```

`OcAgentFilters.vue`: four labelled `<select>`s (Status, Role, Project, Workspace), each with an "All" option (`value=""`); status and role options from `AGENT_STATUSES` / `AGENT_ROLES`; project and workspace options are the sorted distinct non-null values of the `agents` prop. Props `modelValue: AgentFilter; agents: LiveAgent[]`; emits `update:modelValue`. Copy the markup and styles of `OcRunFilters.vue` (labels visible, 24 px minimum target).

`OcAttentionSummary.vue`: props `open: AttentionItem[]` (the type of `attentionSchema`'s `open` items); renders an `OcCard` titled "Attention" with the note `${open.length} open`; empty: "Nothing waits on Jack."; else a list of the newest five by `since` (cause, ticket or "-", age via `ageOf` from `oc-format`) and a link "All attention items" to `/attention/`.

`OcTopBar.vue`: new prop `live: Live | null`; after the health span:

```vue
    <NuxtLink v-if="live" to="/#agents" class="agents" :class="{ warn: live.herdr.state === 'disconnected' }">Agents <b>{{ live.agents.length }}</b> · working <b>{{ count('working') }}</b> · blocked <b>{{ count('blocked') }}</b><template v-if="live.herdr.state === 'disconnected'"> · disconnected</template></NuxtLink>
    <span v-else>Agents <b>-</b></span>
```

with `const count = (s: string) => props.live?.agents.filter((a) => a.status === s).length ?? 0`, and styles `.agents { color: inherit; text-decoration: none; min-height: 24px; display: inline-flex; align-items: center; } .agents:focus-visible { outline: 2px solid var(--oc-primary); } .agents.warn { color: var(--oc-warn); }`.

`OcNav.vue`: new prop `blocked: number`; the badge shows on the `oculus` link when `blocked > 0` (`<span … class="badge">{{ blocked }}<span class="sr"> blocked</span></span>`), the attention badge stays as it is. `OcShell.vue` passes `blocked` through (new prop `blocked: number`).

`app/layouts/oculus.vue`: a second poll:

```ts
const livePoll = useOculusPoll(() => loadLive(), { intervalMs: 5_000, backoffMs: 5_000 })
const blocked = computed(() => livePoll.data.value?.agents.filter((a) => a.status === 'blocked').length ?? 0)
provide('ocLive', { live: livePoll.data, stale: livePoll.error, refresh: livePoll.refresh })
```

and pass `:live="livePoll.data.value"` to `OcTopBar`, `:blocked="blocked"` to `OcShell`.

`app/pages/oculus/index.vue` (keep the existing operations block below):

```vue
<script setup lang="ts">
// …existing imports and inject…
import { computed, inject, nextTick, ref, watch } from 'vue'
import type { Live } from '#oculus-schema'
import { loadAttention } from '../../composables/oculus-api'
import { useOculusPoll } from '../../composables/useOculusPoll'
import { agentChanges } from '../../utils/agent-changes'
import { filterAgents, type AgentFilter } from '../../utils/agent-filter'

const lv = inject<{ live: Ref<Live | null>; stale: Ref<boolean>; refresh: () => Promise<void> }>('ocLive')!
const attention = useOculusPoll(() => loadAttention())
const route = useRoute()
const one = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? '') : typeof v === 'string' ? v : '')
const filter = computed<AgentFilter>(() => ({ status: one(route.query.status), role: one(route.query.role), project: one(route.query.project), workspace: one(route.query.workspace) }))
function setFilter(next: AgentFilter): void { void navigateTo({ query: Object.fromEntries(Object.entries(next).filter(([, v]) => v !== '')), hash: '#agents' }, { replace: true }) }
const shown = computed(() => (lv.live.value ? filterAgents(lv.live.value.agents, filter.value) : []))
const disconnected = computed(() => lv.live.value?.herdr.state === 'disconnected')
// one persistent polite region; the text is cleared for a tick first so the same words are read again
const announce = ref('')
let prev: Live | null = null
watch(() => lv.live.value, async (next) => {
  if (!next) return
  const text = agentChanges(prev, next); prev = next
  if (!text) return
  announce.value = ''; await nextTick(); announce.value = text
})
</script>
```

Template, before the existing content:

```vue
  <OcPageHead title="Oculus" sub="Every herdr agent, what waits on Jack, and the latest work." />
  <div class="sr-only" aria-live="polite" aria-atomic="true" data-testid="agents-live">{{ announce }}</div>
  <section id="agents" aria-labelledby="agents-h" class="agents">
    <h2 id="agents-h">Agents</h2>
    <OcPanel v-if="!lv.live.value && !lv.stale.value" kind="loading" />
    <OcPanel v-else-if="!lv.live.value" kind="error" title="The agent list is not available right now." @retry="lv.refresh()" />
    <template v-else>
      <OcDisconnectedBanner v-if="disconnected" :as-of="lv.live.value.herdr.asOf" />
      <OcAgentFilters :model-value="filter" :agents="lv.live.value.agents" @update:model-value="setFilter" />
      <p v-if="lv.live.value.agents.length === 0 && !disconnected" class="empty">No herdr agents are running.</p>
      <p v-else-if="shown.length === 0 && lv.live.value.agents.length > 0" class="empty">No agent matches.</p>
      <OcAgentsTable v-else-if="shown.length > 0" :agents="shown" :disconnected="disconnected" />
    </template>
  </section>
  <OcAttentionSummary v-if="attention.data.value" :open="attention.data.value.open" />
```

(`lv.stale` is true only when the Nexus API itself does not answer; herdr down is the 200 disconnected answer.)

Stories (`title: 'Oculus/…'`) for each new component and state: `OcAgentsTable` Connected, Disconnected, Empty; `OcAgentStatus` each status and Disconnected; `OcDisconnectedBanner` With time, No list yet; `OcAttentionSummary` Items, Empty; `OcAgentFilters` Default; `OcTopBar` add Agents and Agents disconnected; `OcNav` add Blocked badge. Use `liveFixture()`.

- [ ] **Step 6: Run the unit tests and see them pass**

Run: `pnpm --dir scripts/nexus-web exec vitest run && pnpm --dir scripts/nexus-web typecheck` → PASS.

- [ ] **Step 7: Write the e2e, axe and visual checks**

`tests/e2e/oculus.spec.ts`, add:

```ts
test.describe('the index page: agents (DGS-599)', () => {
  test('lists every agent first, then the attention summary', async ({ page }) => {
    await stub.setMode('oc-ok')
    await page.goto(`${stub.url}/`)
    const rows = page.locator('#agents tbody tr')
    await expect(rows).toHaveCount(7)
    await expect(rows.first()).toContainText('dgs-601')
    await expect(rows.last()).toContainText('dgs-571')
    await expect(page.getByRole('heading', { name: 'Attention' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'All attention items' })).toHaveAttribute('href', '/attention/')
  })
  test('filters live in the URL', async ({ page }) => {
    await stub.setMode('oc-ok')
    await page.goto(`${stub.url}/?role=conductor`)
    await expect(page.locator('#agents tbody tr')).toHaveCount(2)
    await page.getByLabel('Workspace').selectOption('w3')
    await expect(page).toHaveURL(/workspace=w3/)
    await expect(page.locator('#agents tbody tr')).toHaveCount(1)
  })
  test('the top-bar count links to the agents section', async ({ page }) => {
    await stub.setMode('oc-ok')
    await page.goto(`${stub.url}/runs/`)
    await page.getByRole('link', { name: /Agents 7/ }).click()
    await expect(page).toHaveURL(/\/#agents$/)
  })
  test('herdr down: the last list stays, marked disconnected, grey dots, no green, and the top bar keeps the count', async ({ page }) => {
    await stub.setMode('oc-herdr-down')
    await page.goto(`${stub.url}/`)
    await expect(page.getByText('Disconnected from herdr, as of 09:20 (UTC+7). Retrying.')).toBeVisible()
    await expect(page.locator('#agents tbody tr')).toHaveCount(7)
    await expect(page.locator('#agents .st.ok')).toHaveCount(0)
    await expect(page.getByRole('link', { name: /Agents 7 .* disconnected/ })).toBeVisible()
  })
  test('herdr down before any snapshot: no list yet', async ({ page }) => {
    await stub.setMode('oc-herdr-down-fresh')
    await page.goto(`${stub.url}/`)
    await expect(page.getByText('Disconnected from herdr. No agent list yet. Retrying.')).toBeVisible()
  })
  test('herdr comes back: the banner goes and the region says so once', async ({ page }) => {
    await stub.setMode('oc-herdr-down')
    await page.goto(`${stub.url}/`)
    await expect(page.getByText(/Disconnected from herdr/)).toBeVisible()
    await stub.setMode('oc-ok')
    await expect(page.getByTestId('agents-live')).toHaveText('Connected to herdr.', { timeout: 15_000 })
    await expect(page.getByText(/Disconnected from herdr/)).toHaveCount(0)
  })
  test('nothing on the page shows a terminal title or a folder path', async ({ page }) => {
    await stub.setMode('oc-ok')
    await page.goto(`${stub.url}/`)
    await expect(page.locator('#agents tbody tr')).toHaveCount(7)
    const html = await page.content()
    expect(html).not.toMatch(/terminal_title|\/Users\//)
  })
})
```

(The stub's snapshot time 02:20 UTC is 09:20 UTC+7.)

`tests/a11y/oculus-axe.spec.ts`: add `axe: / disconnected ${scheme}` (mode `oc-herdr-down`) next to the existing per-page loop.

`tests/visual/oculus-mobile.spec.ts`: add `['index-disconnected', '/', 'oc-herdr-down']` (extend the tuple with a mode and call `stub.setMode(mode)`).

`tests/unit/built-oculus.test.ts`: the prerendered `index.html` holds the `#agents` section in its loading state and never the words "Disconnected from herdr" or a fixture agent name (`dgs-601`).

- [ ] **Step 8: Run the gates and make the new baselines**

```bash
pnpm --dir scripts/nexus-web generate
pnpm --dir scripts/nexus-web exec vitest run tests/unit
pnpm --dir scripts/nexus-web exec playwright test tests/e2e tests/a11y
pnpm --dir scripts/nexus-web build-storybook
pnpm --dir scripts/nexus-web exec playwright test tests/a11y/stories-axe.spec.ts
pnpm --dir scripts/nexus-web exec playwright test tests/visual --update-snapshots
git -C scripts/nexus-web diff --stat -- tests/visual/__screenshots__
```

Expected: all PASS; new baselines only for the new stories, `oculus-topbar--*`, `oculus-nav--*`, `oculus-mobile-index-*`; the index phone baseline shows the agents as row cards. Open every new or changed PNG and check: no green dot in a disconnected image, the row cards keep their labels.

- [ ] **Step 9: Commit**

```bash
git add -A -- scripts/nexus-web
git commit -m "feat(oculus): show every herdr agent on the index page" -- scripts/nexus-web
```

---

### Task 9: Runs page role and project, no health flags for maestro and conductor (after DGS-598)

**DGS-598 names found after the rebase (written before Step 1):**
- Role function: `roleOf(i: RoleInput): { role: Role; role_from: RoleFrom }` in `packages/cli/src/run/role.ts`, with `RoleInput = { headless?: boolean; inHerdr: boolean; looked: boolean; agentName: string | null; maestroIdentity: boolean }`. Inside herdr it ignores `maestroIdentity` (a Maestro runs outside herdr): conductor, reviewer, scout and builder come from the name, else `other`. Oculus calls `roleOf({ inHerdr: true, looked: true, agentName: name, maestroIdentity: false }).role`. Also there: `ticketOfAgentName(name)`.
- Role set: `ROLES = ["builder", "reviewer", "scout", "maestro", "conductor", "other"]` and `type Role` in `packages/cli/src/run/schema.ts`.
- Run record fields: `project: string | null` and `session_id: string | null` (`RunRecord` in `run/schema.ts`; `record.ts` gives null for old records).
- Already on main from DGS-598 / earlier tasks: `runRowOf` `project`, `runsView` project filter, `VALUE_FLAGS` `project` with `isSafe`, shared `ROLES` and `runRowSchema.project`, `runsQuery.project`, `ALLOWED_KEYS` `project`, `loadRuns` `project`, `runs.vue` project filter and the `RunFilters` Project select.
- Decision: `maestroNames` is deleted (the shared rule does not need the maestro set inside herdr).

**Blocked until DGS-598 is merged into `main`.** The conductor tells the Builder when. Then:

```bash
git fetch origin && git rebase main
```

Resolve conflicts by keeping DGS-598's engine code as it is and this branch's Oculus names; rerun every suite from Tasks 2-8 before Step 1.

**Files:**
- Modify: `packages/cli/src/oculus/live.ts` (role rule, session join), `live.test.ts`
- Modify: `packages/cli/src/oculus/views.ts`, `derive.ts`, `types.ts`, `index.ts` (`VALUE_FLAGS` gains `project`), `views.test.ts`, `index.test.ts`
- Modify: `scripts/nexus-shared/oculus.ts` (`ROLES`, `runRowSchema`), `scripts/nexus-api/src/oculus-route.ts` (`runsQuery`), `oculus-reader.ts` (`ALLOWED_KEYS` gains `project`), `oculus-route.test.ts`
- Modify: `scripts/nexus-web/app/components/oc/OcRunFilters.vue`, `OcRunsTable.vue`, `OcWorkersTable.vue`, `OcAgentsTable.vue` (+ stories, tests), `app/pages/oculus/runs.vue`, `app/composables/oculus-api.ts`, `tests/oculus-fixtures.ts`, `tests/e2e/stub-server.ts`, `tests/e2e/oculus.spec.ts`

**Interfaces:**
- Consumes (from DGS-598, find the exact names after the rebase, do not guess): (a) the role function DGS-598 exports for a herdr agent name or identity card; find it with `git grep -n -E "export (function|const) .*[Rr]ole" -- packages/cli/src/run`; (b) the run record fields DGS-598 adds: `role` values (`maestro`, `conductor`), `project`, and the Claude session id (`git show main:packages/cli/src/run/record.ts | grep -n -E "project|session"`). Write the names you found into `plan.md` under this task before Step 1, so the reviewer sees them.
- Produces: `RunRow.project: string | null`; `ROLES = ['maestro', 'conductor', 'builder', 'reviewer', 'scout', 'other']`; runs query `project=<safe id>`; `loadRuns({ …, project })`.

- [ ] **Step 1: Write the failing tests**

CLI (`views.test.ts`): with `makeDepot()` write runs whose records carry `project` (`DigiSmith`, `Emma`) and roles `maestro`, `conductor`, `builder`; assert `runsView(env, NOW, { project: 'Emma' })` returns only the Emma run, `runsView(env, NOW, { role: 'conductor' })` only the conductor run, and every row has `project`. Assert `runOculus(["view", "runs", "--project", "../x"], …)` exits 1 ("bad id").

CLI (`live.test.ts`): replace the local `roleOf` cases with the same table run through DGS-598's function (import it; delete `roleOf` from `live.ts`); add a session join case: a run whose record carries the Claude session id `sess-9` and no pane matches an agent with `agent_session.value === "sess-9"`; the pane match still wins when both exist.

API (`oculus-route.test.ts`): `/api/v1/oculus/runs?project=Emma` passes `project: 'Emma'` to the reader; `?project=../x` → 400; `?role=maestro` → 200.

Web: `OcRunFilters` has a Project select (options = distinct projects of the loaded runs) and Role options including maestro and conductor; `OcRunsTable` has a Project column; a maestro or conductor row shows its state as "-" with no `.st` dot (in `OcRunsTable` and `OcWorkersTable`); `OcAgentsTable` links a project to `/runs/?project=<project>`. e2e: `/runs/?role=conductor&project=DigiSmith` lists only those runs and the conductor row has no health dot.

- [ ] **Step 2: Run them and see them fail**

Run the four suites (CLI `src/oculus`, `scripts/nexus-api`, web vitest, web e2e for the new cases) → FAIL.

- [ ] **Step 3: Implement**

- `live.ts`: import DGS-598's role function and call it in place of `roleOf` (keep `maestroNames` only if DGS-598's function needs the maestro set; otherwise delete it with its tests); in `runsByPane` also index open runs by the session id field and, for an agent without a pane match, look up `agent_session.value` (read it in `liveView`, never output it).
- `types.ts` / `derive.ts` (`runRowOf`): `project: run.project ?? null` (the DGS-598 field name); `RunRowView.role` gains `maestro | conductor`.
- `views.ts` (`runsView`): filter `a.project` like `a.role`.
- `index.ts`: `VALUE_FLAGS` gains `project`; `project` is checked with `isSafe` like `run` and `ticket`.
- `nexus-shared/oculus.ts`: `ROLES` as above; `runRowSchema` gains `project: z.string().nullable()`.
- `oculus-route.ts`: `runsQuery` gains `project: id.optional()`; `oculus-reader.ts`: `ALLOWED_KEYS` gains `project`.
- Web: `loadRuns` query gains `project`; `runs.vue` `filters` gains `project: isSafeId(one(route.query.project)) ? one(route.query.project) : ''`; `OcRunFilters` and `OcRunsTable` as tested; `const unflagged = (r: RunRow) => r.role === 'maestro' || r.role === 'conductor'` in both tables renders `<span class="muted">-</span>` instead of `OcStatus`; fixtures gain one maestro and one conductor run with projects.

- [ ] **Step 4: Run every suite and refresh the baselines this task changes**

```bash
pnpm --filter @digismith/cli exec vitest run src/oculus src/strip-types.smoke.test.ts
pnpm vitest run scripts/nexus-api
pnpm --dir scripts/nexus-web exec vitest run && pnpm --dir scripts/nexus-web typecheck
pnpm --dir scripts/nexus-web generate && pnpm --dir scripts/nexus-web exec playwright test tests/e2e tests/a11y
pnpm --dir scripts/nexus-web build-storybook && pnpm --dir scripts/nexus-web exec playwright test tests/visual --update-snapshots
git -C scripts/nexus-web diff --stat -- tests/visual/__screenshots__
```

Expected: all PASS; only Runs, Workers, Run filters and Agents table baselines change. Open each and check.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(oculus): filter runs by role and project, no health flag for maestro and conductor" -- packages/cli/src/oculus scripts/nexus-shared/oculus.ts scripts/nexus-api/src scripts/nexus-web
```

---

## After the merge (not a task; the conductor, on the Maestro's word)

Spec section 3, in this order: back up the depot Caddyfile and `bin/caddy-run`; Cloudflare A record `oculus` → `100.108.1.19`, DNS only, no AAAA; `sh scripts/caddy/install.sh` from the main checkout and `caddy validate`; `launchctl kickstart -k gui/$(id -u)/com.jazurite.digismith.caddy`; CLI build in the main checkout; `launchctl kickstart -k gui/$(id -u)/com.jazurite.digismith.nexus-api`; `scripts/nexus-web/build-www.sh`; first use (spec section 11). Rollback as in spec section 3.
