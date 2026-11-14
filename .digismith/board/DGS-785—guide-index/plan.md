# DGS-785 plan: `dg guide` and the guide index at session start

Spec: `spec.md` in this folder (approved, committed 2d27021e). Test-first: every task writes the failing test, sees it fail, then writes the code. pnpm only. Title-only conventional commits, no AI attribution. No `hooks/` edit. No ClickUp write anywhere (reads only, through `createClient`).

## One correction to the spec (found while planning)

`packages/cli` compiles with `rootDir: "src"` (`tsconfig.build.json`), so the CLI cannot import from `scripts/guides/`. The plan changes the split, not any decision:

- The Markdown parsing (adoption test, slug, "When to use it") lives in `packages/cli/src/guide/` (it only runs inside `dg guide refresh`).
- The hook side, `scripts/guides/index-text.ts`, parses no Markdown. It reads `index.json` only (the cache file is the contract) and formats the block.
- A contract test in `scripts/` reads a fixture `index.json` that a CLI-side test also produces, so the two sides cannot drift (Task 8).

`spec.md` D5 is edited to say this (Task 0). Everything else in the spec stands.

## File map

New, CLI (`packages/cli/src/guide/`):
- `parse.ts` + `parse.test.ts`: `unescapeMd`, `isAdopted`, `slugFor`, `assignSlugs`, `whenToUse`, `cleanPage`.
- `cache.ts` + `cache.test.ts`: depot paths, `readIndex`, `writeIndexAtomic`, `writePageAtomic`, `readPage`, lock.
- `refresh.ts` + `refresh.test.ts`: `refreshGuides(client, deps)`.
- `lookup.ts` + `lookup.test.ts`: `resolveGuide(guides, name)`.
- `index.ts` + `index.test.ts`: yargs `guide [name]`, `list`, `refresh`.
- `fixtures/close-a-ticket.md`, `fixtures/start-an-epic.md`: the real escaped Markdown of DGS-758 and DGS-759 (trimmed copies, no secrets).
- Modified: `packages/cli/src/index.ts` (register `guideCommand`), `packages/cli/src/index.test.ts` (help lists `guide`).

New, plugin (`scripts/guides/`):
- `index-text.ts` + `index-text.test.ts`: `buildGuideIndex`, `maybeRefresh`.
- Modified: `scripts/session-cards/card-hook.ts` (`identityContext` appends the block) and `scripts/session-cards/card-hook.test.ts`.

Not touched: `hooks/hooks.json`, `scripts/session-init.ts`, any skill, `.digismith/config.yml`.

## Tasks

### Task 0. Spec fix, fixtures, probe (no production code)

1. Edit `spec.md` D5: the parsers live in `packages/cli/src/guide/`; `scripts/guides/` holds `index-text.ts` only and reads `index.json`.
2. Save the fixtures: `dg clickup get-task DGS-758 --markdown` and `DGS-759`, take `markdown_description` with `jq -r`, write the two `.md` files under `packages/cli/src/guide/fixtures/`. They keep ClickUp's escapes (`\.`, `\~`). Check by eye that no token or email-only secret is in them.
3. Probe (read only): does `include_markdown_description=true` work on the list call? Run a one-off `node` check through the client in a scratch folder, or read the ClickUp API reference. Write the answer into the plan notes (a line at the end of this file). If yes, Task 5 uses it and skips the per-task fetch; if no, Task 5 keeps the per-task fetch. The tests in Task 5 cover the per-task path either way; the list-markdown path is an `if` on a `markdown_description` already present.
4. Commit: `docs(board): guide index parser fixtures (DGS-785)` (fixtures are real code inputs, so they ride with Task 1's commit if the worker prefers; one commit either way).

### Task 1. Parser (`parse.ts`), tests first

Tests (`parse.test.ts`), each fails first:
1. `unescapeMd("### 1\\. The idea")` is `"### 1. The idea"`; `\~` becomes `~`; a backslash before a letter stays.
2. `isAdopted` is true for the two fixtures (`**Adopted by Jack on ...**` and `**Version 1. Adopted by Jack on ...**`); false for a draft page, an empty string, and a page that only mentions "Adopted by Jack" in line 5.
3. `slugFor("Guide: close a ticket")` is `close-a-ticket`; `"Guide: arise, resume a Maestro session"` is `arise-resume-a-maestro-session`; `"Guide: Emma ticket flow"` is `emma-ticket-flow`; `"Guide: backups & restore"` is `backups-and-restore`; `"Manual: Upkeep (group intro)"` is `manual-upkeep`; a name with neither prefix returns `undefined`.
4. `assignSlugs`: two tasks with one slug get `-dgs-12` and `-dgs-13` suffixes; a task whose slug is `list` or `refresh` gets `-<key>`; output is guides first, then manuals, each sorted by slug.
5. `whenToUse` on the DGS-758 fixture returns the three bullets joined with ` / `, with backticks removed; on DGS-759 it returns both bullets cleaned (`Guide: close an epic` text stays, `(Guide: close an epic)` parens kept).
6. `whenToUse` fallbacks: no "When to use it" heading gives the first sentence of "What it is"; neither section gives `""`; a heading with an empty body falls back too; `[text](url)` becomes `text`; bold markers drop; a table after the section is not read (stops at the next heading).
7. `cleanPage` unescapes outside code fences only (a fenced block with `\.` keeps it).

Code: pure functions, no I/O.
Commit: `feat(guide): parse adopted guide pages (DGS-785)`.

### Task 2. Cache (`cache.ts`), tests first

Tests use a temp `DIGISMITH_DEPOT_DIR`:
1. `guidesDir(env)` is `<depot>/guides`.
2. `writeIndexAtomic` then `readIndex` round-trips `{version:1, fetched_at, list_id, guides[]}`; no `*.tmp` file is left behind; a crash simulated between temp write and rename leaves the old file readable.
3. `readIndex` returns `undefined` for a missing file, invalid JSON, a wrong `version`, or `guides` not an array. It never throws.
4. `writePageAtomic` and `readPage(slug)`: round trip; a slug with `/` or `..` is rejected (path safety: `^[a-z0-9-]+$`).
5. Lock: `takeLock(now)` is true when absent; false when younger than 2 minutes; true again (taken over) when older; `releaseLock` removes it.

Commit: `feat(guide): depot cache for guide index and pages (DGS-785)`.

### Task 3. Lookup (`lookup.ts`), tests first

1. Exact slug wins over a prefix of another slug.
2. Key match, any case: `dgs-758` finds `close-a-ticket`.
3. Unique prefix: `close-a-t` finds it; `close` that matches `close-a-ticket` and `close-an-epic` returns `{kind:"ambiguous", matches:[...]}`.
4. Unknown returns `{kind:"unknown", closest:[...up to 3 by shared prefix, then substring]}`; empty input is unknown with no closest.

Commit: `feat(guide): look up a guide by slug, key or prefix (DGS-785)`.

### Task 4. Refresh (`refresh.ts`), tests first

`refreshGuides(client, { env, now, listId })` with a fake client (`getAllListTasks`, `getTaskByRef`/`get`):
1. Two adopted tasks plus a backlog `Guide:` draft plus an SOP: only the two adopted ones are fetched for Markdown, written to `pages/` and listed in `index.json`; the draft and the SOP are absent.
2. The pre-filter reads `text_content` (`Adopted by Jack`, `Version N. Adopted by Jack`); the Markdown check repeats it, and a task that passes the pre-filter but fails the Markdown check is dropped.
3. A task whose `date_updated` equals the cached `updated` and whose page file exists is not fetched again (`get` call count is 0 on the second run).
4. A guide that disappears from F.9 (or is no longer adopted) drops out of `index.json` and its page file stays unread (no delete: the tool never deletes; a stale page file is harmless because lookup goes through the index).
5. One per-task fetch throws: that guide keeps its old cache entry; the others update; the result says `failed: 1`; exit status of the CLI stays 0 for a partial refresh and 1 only when the list call fails.
6. The lock: a refresh with a fresh lock returns `{skipped:"locked"}` and calls nothing; the lock is released in a `finally` on success and on failure.
7. If a list task already carries `markdown_description` (Task 0 probe), no per-task call is made.

Commit: `feat(guide): refresh the guide cache from ClickUp list F.9 (DGS-785)`.

### Task 5. The `dg guide` command (`index.ts`), tests first

Handler-level tests with a fake client and a temp depot (same style as `list-tasks.test.ts`, `handlerOf`):
1. `list`: live ok prints `slug<TAB>key<TAB>when` lines (guides then manuals) and exits 0; `--json` prints the `guides` array; `--offline` makes no client call.
2. `list`, client throws, cache present: prints from cache, stderr `guide: ClickUp unreachable, using cache from <UTC+7 time>`, exit 0. No cache: stderr `guide list: ClickUp unreachable and no cache`, exit 1.
3. `<name>` live ok: stdout is exactly the cleaned page (no extra lines, starts with `**Adopted by Jack`), exit 0, the cache page is updated.
4. `<name>` unknown: exit 2, stderr `guide: no guide "x". Closest: a, b, c`. Ambiguous: exit 2, stderr `guide: "close" matches: a, b`. A task that is no longer adopted is unknown.
5. `<name>`, ClickUp down, page cached: prints the cached page, stderr cache line, exit 0. No cached page: exit 1, stderr `guide: ClickUp unreachable and no cached page for "x"`.
6. The 8-second limit: a client call that never resolves is cut at the limit (use fake timers); the command then takes the cache path.
7. Token safety: a client error whose message holds `Bearer sk-live-123` prints through a scrub that replaces `Bearer <anything>` and `pk_`/`sk-` strings with `***`; stdout stays clean.
8. `refresh`: prints `guides: N (M changed)`; `--quiet` prints nothing, also on failure; exit 1 only on failure.
9. Register in `packages/cli/src/index.ts`; `index.test.ts` asserts `guide` appears in `buildCli([]) --help` output; `packages/cli/src/strip-types.smoke.test.ts` keeps passing (no `enum`/parameter-property syntax).

Commit: `feat(guide): dg guide list, show and refresh (DGS-785)`.

### Task 6. Index block (`scripts/guides/index-text.ts`), tests first

`index-text.test.ts` (temp depot, fixture `index.json` written by the test):
1. Header is exactly `User manual (DigiSmith): before acting on a request that matches a line, read the page with dg guide <slug>.`
2. Sentinel test: a fixture `pages/*.md` holding `BODY-SENTINEL-7f3a` and `## Steps`; the block holds neither.
3. Size: 0, 2, 40 and 150 guides with 300-byte `when` strings: `Buffer.byteLength(block)` is at most 3000 every time. Multi-byte `when` text (Vietnamese, an em dash) is cut at a character boundary, never mid-character, and the byte count still holds.
4. Order and drop: guides then manuals; with 150 entries, manuals go first, then guides from the end; the trailer `(N more: dg guide list)` shows the exact dropped count. Per-line budget is clamped to 40..200 bytes; a long `when` ends with `…` at a word boundary; an empty `when` prints the slug alone.
5. No cache / corrupt cache / unreadable folder: no throw; no cache gives the one line `Guide index: not cached yet. Run dg guide list.`; a corrupt cache gives the same line.
6. Cache older than 7 days: a `cache is N days old` note is added to the header line's end, and the total stays under the cap.
7. `maybeRefresh({ now, env, spawn })`: calls `spawn("dg", ["guide","refresh","--quiet"], {detached:true, stdio:"ignore"})` once and `unref` for a missing cache and for a 16-minute-old one; no call for 14 minutes; no call when `refresh.lock` is younger than 2 minutes; a `spawn` that throws (ENOENT) is swallowed; it returns without awaiting anything.

Code: `buildGuideIndex(cacheJson, now)` pure; `readGuideIndexBlock(env, now, deps)` reads the file, calls `maybeRefresh`, returns the block or `undefined`. It imports only `node:` modules and `../depot-dir.ts` (the plugin must run under `node --experimental-strip-types` with no workspace imports).

Commit: `feat(guide): build the capped guide index block (DGS-785)`.

### Task 7. Wire into the Maestro context, tests first

Extend `card-hook.test.ts`:
1. A Maestro identity record for a temp folder plus a fixture cache: `startHook(event, env)` returns `context` that ends with the guide block, and the block starts with the header line.
2. A worker env (`DIGISMITH_ROLE` set) and a conductor env: the context holds no guide block (the existing branch returns no context at all).
3. The first-prompt fallback (`identityPromptHandler`) output contains the block on the prompt that writes the card (test in `prompt-identity.test.ts`).
4. If `readGuideIndexBlock` throws: `startHook` still returns the identity context, unchanged (wrap in try/catch).
5. `hooks-json.test.ts` still passes, and a new assertion in it (or a separate test) checks `hooks/hooks.json` is byte-identical to `git show HEAD:hooks/hooks.json`-style expected content: no new hook entry, i.e. the SessionStart command count stays 4.

Code: `identityContext` gets an optional third part; the call site passes `env`. One new import in `card-hook.ts`.
Commit: `feat(guide): add the guide index to the Maestro's session context (DGS-785)`.

### Task 8. Contract test across the two sides

`scripts/guides/index-contract.test.ts`: `refreshGuides` (from `packages/cli/src/guide/refresh.ts`, with a fake client over the two fixtures) writes a real `index.json` into a temp depot; `buildGuideIndex` reads that file; the block holds `close-a-ticket:` and `start-an-epic:` lines with the real "When to use it" text and the header, and stays under 3000 bytes. This test imports the CLI source from `scripts/` (tests may; the build excludes tests).

Commit: `test(guide): index.json contract between dg guide and the hook (DGS-785)`.

### Task 9. Whole-branch checks

1. `pnpm test` (root) green; `pnpm --filter @digismith/cli build` green (proves no cross-package import slipped in).
2. Read `git diff main --stat`: only the files in the file map, nothing under `hooks/`.
3. Manual dry run, offline: `DIGISMITH_DEPOT_DIR=<temp> dg guide list --offline` prints the "no cache" error with exit 1.

## After the build (steps 2-3 of the order; not part of the refine)

Whole-branch review (Claude), fix verified findings, merge locally with post-finish hooks 01-03, `report.html` and `plan.md` committed by pathspec, push. Then real use: (1) `dg guide refresh`, then `dg guide list` shows `close-a-ticket` and `start-an-epic`; (2) `dg guide close-a-ticket` prints DGS-758's page, starting `Adopted by Jack`; (3) a fresh Maestro session shows the index block, under 3000 bytes, no page body. Time: about 3 hours of worker time (parser 40 min, cache and lookup 30, refresh 40, command 40, hook and wiring 30, review and merge extra).

## Notes

- Task 0 probe result (list call with `include_markdown_description`): _fill in during the build_.
