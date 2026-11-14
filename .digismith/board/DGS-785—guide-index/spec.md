# DGS-785 spec: the Maestro reads the user manual (`dg guide` + a guide index at session start)

Status: approved by the Maestro (2026-11-14), taste questions decided. Sign-off Auto, Mode Manual. Refinement only: no code in this step.

## Problem

Adopted user-manual guides live in ClickUp list F.9 (`1301150000002968`). Today two are adopted (DGS-758 close a ticket, DGS-759 start an epic); about 25 more are coming. No Claude Code session can find them. The Maestro works from memory notes and skill text, not from the page Jack adopted.

## Goal

1. `dg guide list` and `dg guide <name>` read adopted guides from F.9.
2. A Maestro session starts with a short index: one line per guide. Never a page body.
3. The Maestro matches Jack's meaning to an index line, then runs `dg guide <name>` and reads the page before acting.
4. ClickUp stays the one source. A cache in the depot means session start never waits on ClickUp and works offline.

Out of scope (no-gos): skill changes; commands that run a guide's steps (DGS-786); page bodies at start; publishing the docs (DGS-748).

## Facts found (checked 2026-11-14)

- `dg clickup list-tasks` returns `text_content` (plain text, no Markdown, headings and bullets flattened) but no `markdown_description`. The "When to use it" section cannot be cut reliably from plain text, because the next heading is just another line. `get-task --markdown` gives `markdown_description` with real `##` headings.
- F.9 holds 33 tasks. Names start with `Guide: ` (22), `Manual: ` (6, ending ` (group intro)`), or something else (SOPs, old tickets). Only DGS-758 and DGS-759 are adopted.
- An adopted page's first line, in `markdown_description`, is `**Adopted by Jack on <date> ...**` or `**Version N. Adopted by Jack on ...**`. DGS-759 uses the `Version N.` form.
- In `markdown_description` ClickUp escapes some characters: `### 1\. The idea`, `\~`. "When to use it" is `## When to use it` followed by `*   ` bullets.
- Session context for a Maestro comes from `startHook` in `scripts/session-cards/card-hook.ts` (`identityContext`). It runs at SessionStart and, as a fallback, on the first prompt (`prompt-identity.ts`). Workers and conductors have `DIGISMITH_ROLE` or `HERDR_PANE_ID` set and never reach it.
- `scripts/session-init.ts` is the all-sessions hook script. `hooks/hooks.json` already runs both.
- Depot path helper: `scripts/depot-dir.ts` (`depotDir()`, `DIGISMITH_DEPOT_DIR` override for tests).

## Decisions

### D1. Name and slug rule

A guide is an F.9 task that is **adopted** and whose name starts with `Guide: ` or `Manual: `.

- Adopted test: strip `*`, `_` and backslashes from the first non-blank line of `markdown_description`; it must match `^(Version \d+\. )?Adopted by Jack\b`. Anything else (backlog drafts, SOPs, old tickets) is not a guide and is never listed.
- Slug for `Guide: X`: `X` lowercased, `&` to `and`, every run of non-`[a-z0-9]` to one `-`, trimmed. `Guide: close a ticket` gives `close-a-ticket`. `Guide: arise, resume a Maestro session` gives `arise-resume-a-maestro-session`.
- Slug for `Manual: X (group intro)`: drop the ` (group intro)` suffix, slug the rest, keep the prefix: `manual-upkeep`. The prefix keeps a group intro from clashing with a guide of the same words.
- `kind` is `guide` or `manual`. Lists show guides first, then manuals, each sorted by slug.
- Collision (two adopted tasks, one slug) or a slug equal to a subcommand (`list`, `refresh`): the slug gets `-<key lowercase>` (`close-a-ticket-dgs-758`). Rare; it is deterministic.
- Lookup in `dg guide <name>`, in this order: exact slug; ticket key (`DGS-758`, any case); unique slug prefix (`close-a-t`). A prefix that matches more than one slug is an error that lists the matches.

Reason: Jack and agents type the words from the ticket name. The key and prefix forms cost little and save one `list` call.

### D2. Reading the "When to use it" line

Only from `markdown_description`, never from `text_content`.

1. Unescape: `\` followed by ASCII punctuation becomes that character (`\.` to `.`, `\~` to `~`).
2. Find the first heading line matching `^#{1,6}\s*when to use it\s*$` (case-insensitive, after unescaping and stripping `*`).
3. Take lines until the next heading line or the end. Bullets (`*`, `-`, `1.`) are items; plain lines are items too. Blank lines are skipped. Tables are not read.
4. Per item: drop backticks and `**`, turn `[text](url)` into `text`, collapse whitespace.
5. `when` = items joined with ` / `.
6. Fallback 1 (no such section, or it is empty): first sentence of the `## What it is` section, same cleaning.
7. Fallback 2 (neither): `when` is empty and the index line shows the slug only.

The full `when` string is stored in the cache. The index may cut it (D5); `dg guide list` shows it in full.

### D3. Cache: session start never waits on ClickUp

Location: the depot, never the repo: `<depotDir()>/guides/`.

- `index.json`: `{ "version": 1, "fetched_at": "<UTC ISO>", "list_id": "...", "guides": [{ "slug", "key", "id", "kind", "name", "when", "updated" }] }`. `updated` is the task's `date_updated`.
- `pages/<slug>.md`: the cleaned page, one file per guide (written by a refresh; read by `dg guide <name>` when ClickUp is down).
- All writes: write a temp file in the same folder, then rename. A reader never sees half a file.

Who reads: the hook reads only `index.json`. It makes no network call and spawns nothing it waits for.

Who refreshes:

1. `dg guide refresh`: fetches live and rewrites the cache. Also run by `dg guide list` and `dg guide <name>` as a side effect of a live read.
2. The session-start hook starts `dg guide refresh --quiet` **detached** (stdio ignored, unref) when `index.json` is missing or `fetched_at` is older than **15 minutes**. It never waits, and a missing `dg` binary or a spawn error is swallowed.
3. A lock file `guides/refresh.lock` (contents: start time) stops two refreshes at once. A refresh skips when the lock is younger than 2 minutes; an older lock is taken over.

Refresh steps (one worker fetches, rate limits stay with the existing client):

1. One `getAllListTasks(F.9)` call (needs `include_closed`; DGS-758 and DGS-759 are `done`).
2. Pre-filter by name prefix and by `text_content` starting with `Adopted by Jack` or `Version N. Adopted by Jack`. This keeps the markdown fetches to adopted guides only (2 today, about 27 later).
3. For each adopted guide whose `date_updated` differs from the cached `updated` (or whose page file is missing): one `get-task` call with `include_markdown_description`. Unchanged guides reuse the cache.
4. Re-check adoption on the markdown (D1); parse `when` (D2); write pages, then `index.json` last.
5. A guide that was adopted and is no longer (Jack un-adopts it) drops out at the next refresh. A guide whose fetch fails keeps its old cache entry.
6. Probe in plan task 1: whether `include_markdown_description=true` also works on the list call. If it does, step 3 collapses into step 1. The spec holds either way.

Staleness and fallback (silent at session start):

- No cache yet: the injected text is one line: `Guide index: not cached yet. Run dg guide list.` (the hook's own detached refresh fills it for the next session).
- Cache older than 7 days: the index header adds `cache is N days old`.
- ClickUp down or offline: refresh fails quietly, the old cache stays. The hook prints nothing about it. `dg guide ...` prints one stderr line `guide: ClickUp unreachable, using cache from <UTC+7 time>` and still exits 0.
- A new or changed guide shows at the next session start after the 15-minute window: the first session after an adoption kicks the refresh, the one after it sees the guide. Running `dg guide refresh` shows it at once.

### D4. Which sessions get the index

**Maestro sessions only** (a session whose folder matches an identity record, outside herdr, no `DIGISMITH_ROLE`).

Reasons: Jack speaks to the Maestro and expects it to match his meaning; workers and conductors act on written orders; every extra session would add the full index for no use. Part of the cost of the index (up to 3 KB) is paid only where it helps. Any other session can still run `dg guide list`.

### D5. Where the hook change goes; format; cap; test

**No edit to `hooks/hooks.json`.** `hooks/` is a PROTECTED path. The Maestro's SessionStart context already comes from `identityContext` in `scripts/session-cards/card-hook.ts`; the index is one more block returned from there. If the worker finds it needs a `hooks/` edit, it must stop and ask. The first-prompt fallback (`prompt-identity.ts`) gets the index too, because it prints `r.context`.

New files, plain scripts in the plugin (they must run with `node --experimental-strip-types`, no workspace imports):

- `scripts/guides/cache.ts`: read and validate `index.json`; slug, adoption and `when` parsing shared by the CLI (the CLI imports them from here, so one parser exists).
- `scripts/guides/index-text.ts`: `buildGuideIndex(cache, now): string` and `maybeRefresh(...)`.
- `scripts/session-cards/card-hook.ts`: `identityContext` appends `buildGuideIndex(...)` output; wrapped so any error gives no block.

Injected format (UTF-8, LF, plain text):

```
User manual (DigiSmith): before acting on a request that matches a line, read the page with dg guide <slug>.
- close-a-ticket: A build ticket is merged and pushed. / A ticket with no merge is finished: ...
- start-an-epic: Jack has an idea for an epic, or wants to pick up an epic he parked earlier. / ...
- manual-upkeep: (slug only when no line)
(N more: dg guide list)
```

Cap rules (deterministic, tested):

1. Hard cap: the whole block is at most **3000 bytes** (UTF-8), under the 3 KB (3072) the ticket names.
2. Header is fixed (about 150 bytes). The rest is split by guide count: per-line budget = floor((3000 − header − trailer) / count), clamped to 40..200 bytes. A `when` longer than its budget is cut at a word boundary and ends with `…`.
3. If the lines still do not fit at 40 bytes each: drop `manual-*` lines first (last in order), then drop guides from the end of the sorted list. The trailer `(N more: dg guide list)` states how many were dropped.
4. The block holds slugs and `when` text only: never page bodies, never the cache's `name`, never other fields.

Test (vitest, `scripts/guides/index-text.test.ts`):

1. Fixture cache with a unique sentinel in page bodies (`pages/*.md` hold `BODY-SENTINEL-...`); the injected text must not contain the sentinel, and must not contain any `## ` heading.
2. Sizes 0, 2, 40 and 150 guides, long `when` lines: byte length of the block ≤ 3000 every time; the 150 case holds the `(N more ...)` trailer with the right N.
3. No cache, corrupt cache, unreadable folder: no throw; the "not cached yet" line or no block.
4. `maybeRefresh` with an injected `spawn`: called once for a missing or 16-minute-old cache, not called for a 14-minute-old one or a fresh lock; a spawn that throws is swallowed; the call is detached with ignored stdio.
5. Wiring test: `identityContext` output contains the guide block for a Maestro and `startHook` for a worker env (`DIGISMITH_ROLE` set) does not.

### D6. `dg guide` contract

Registered in `packages/cli/src/index.ts` as the `guide` command (`packages/cli/src/guide/`). Reads go only through `createClient` from `packages/cli/src/clickup/lib.ts`, the same path every other `dg clickup` read uses: no token or header is ever printed, no `curl`, no separate script.

`dg guide list [--json] [--offline]`
- stdout: one line per guide, `slug<TAB>key<TAB>when` (guides then manuals); `--json` prints the cache's `guides` array.
- Tries a live refresh first (8-second limit); on failure uses the cache. `--offline` skips the live try.
- Exit 0 on success (live or cache). Exit 1 when ClickUp fails and no cache exists: stderr `guide list: ClickUp unreachable and no cache`.

`dg guide <name>` (the `guide [name]` default command; `list` and `refresh` are subcommands)
- stdout: the guide page as Markdown with ClickUp's escapes removed (`### 5. Start it`), nothing else. Page text only, no wrapper lines, so it can be piped.
- Live fetch of that one task first (8-second limit), updates the cache; on failure the cached page.
- Exit 0: printed. Exit 2: unknown name or ambiguous prefix; stderr `guide: no guide "x". Closest: a, b, c` or `guide: "close" matches: a, b`. Exit 1: ClickUp failed and no cached page: stderr `guide: ClickUp unreachable and no cached page for "x"`.
- A task that exists but is not adopted any more is "unknown" (exit 2).
- No name: prints the usage and exits 1 (yargs default).

`dg guide refresh [--quiet]`
- Rewrites the cache (D3). Prints `guides: N (M changed)` unless `--quiet`. Exit 0 on success, 1 on failure (also silent with `--quiet`).

Errors print `err.message` only, as every other command does; the client already omits credentials. A test asserts a thrown error that carries a token-shaped string is not echoed in the CLI's own formatting wrapper (the same convention as the `clickup` commands).

## Risks left

- A refresh is up to 1 list call plus 1 call per changed adopted guide; with 27 guides the first refresh is about 28 calls. Rate limiter exists; later refreshes cost 1 call.
- The detached refresh depends on `dg` being on the PATH of the hook process; if it is not, the cache only refreshes when someone runs `dg guide` by hand. The plan's real-use check proves the PATH case.
- A Desktop plugin copy that is stale shadows this (see `reference_desktop-plugin-copies`); not changed here.

## Decisions on the open questions (Maestro, 2026-11-14)

1. Header text, exactly: `User manual (DigiSmith): before acting on a request that matches a line, read the page with dg guide <slug>.` (The `[digismith guides]` tag is not used.)
2. Manual group intros are in the index, listed after the guides, and dropped first when the 3000-byte cap is hit.
3. No aliases. Lookup by slug, ticket key or unique prefix is enough.
