# DGS-389 plan: move history.html out of the public repo into the depot (checkpoint 1, no code)

2026-10-11. Worker `dgs-389`. Status: waiting for "approved: checkpoint 1".

## Facts read
- Page: `.digismith/history.html`, 170,932 bytes, 103 commits of history, LF/CRLF handled by the script.
- 271 `href`s: 2 external, 4 `#` anchors, 265 file links.
  - 198 point into `docs/`, 63 into `board/`, 4 into `../backlog/` (platform-clan, autonomous-agentic-architecture, imperium-roadmap-list, clickup-synchronization).
  - By file: 95 plan.md, 84 report.html, 79 design.html, 7 others (screenshots section, report.md, the 4 backlog files).
  - **256 of the 265 resolve today. 9 are dead already** (3 entries x design/plan/report): `docs/A/A.0/lineage-handoff/*` (3), `docs/A/A.2/centralized-digismith-config-file/*` (3), `docs/A/A.2/migrate-own-repo-config-yml/*` (design, plan, report). They died in the clan A renumbering. Not this ticket's job; I list them, I do not fix them.
- The script `update-history.ts` reads reports from the merge range (`git diff base..head`), then writes `cwd/.digismith/history.html` (line 168). Link hrefs come from `buildReferenceLinks` as relative `docs/..` or `board/..`. Tests run the script in temp git repos (`runScript(cwd, args)`); the page there lives at `<tmp>/.digismith/history.html`.
- No depot `history/` folder exists yet. `~/.digismith-depot/` holds no git repo at its root.

## 1. The new home
- `~/.digismith-depot/history/history.html` inside its own git repo `~/.digismith-depot/history/.git`. **No remote.** Every hook write = one commit there (`docs(history): record shipped features`, title only, no AI attribution).
- One path, one setting: env var **`DIGISMITH_HISTORY_DIR`**, default `~/.digismith-depot/history`. The script resolves: `--history-dir <dir>` flag, else the env var, else the default. The page is `<dir>/history.html`.
- Tests override it with `--history-dir <tmp>` (same style as `--base/--head`), so no test touches the real depot. The hook file passes nothing and uses the default.
- Why not `.digismith/config.yml`: it is committed in the public repo and is per-checkout; the depot path is per-machine.

## 2. Links: one scheme
**Proposal: absolute GitHub URLs of the public repo on `main`**, e.g. `https://github.com/Jazurite/DigiSmith/blob/main/.digismith/docs/<slug>/plan.md`. Same scheme for old entries (rewritten once) and new entries (the hook writes them).
- Pro: works from any node, any browser, and from the later server (DGS-336). No login (repo is public). Stable path text, easy to rewrite by regex (`href="(docs|board)/..."` and `href="../backlog/..."`).
- Con: `report.html` and `design.html` show as source on GitHub, not rendered. Links break when DGS-327 cleanup moves or removes those files (the 9 dead ones are the same failure). A link to `main` is not pinned to the commit.
- Rejected alternative: `file://` paths into the main checkout on the Workbox. Renders HTML, but works only on the Workbox and breaks on any second node.
- Base URL: derived from a constant with env override `DIGISMITH_HISTORY_LINK_BASE` (tests use it). URL-encode the em dash in board folder names (`%E2%80%94`).
- The 9 dead links get rewritten like the rest (they stay dead). Count after rewrite is checked: 256 resolve against the checkout, 9 dead, 0 new.

## 3. Hook 03 after the change
- Same steps: `IS_DIGISMITH` check, read pins `refs/digismith/post-finish/<branch>/{base,head}`, run the script with `--base/--head`. Missing pin still stops. `APPENDED <n>: <titles>` / `NOTHING (no report in range)` output and the non-zero-exit stop stay as they are.
- Changed: the script writes `<history-dir>/history.html`. On `APPENDED` the hook runs `git -C <history-dir> add history.html && git -C <history-dir> commit -m "docs(history): record shipped features"`. **No `git add` in the public repo, no push of the page.** The hook's own push line goes away; the public repo gets no commit from this hook.
- Depot repo missing:
  - The page file is missing: **stop**, message "NO HISTORY HOME <dir>: restore it or run the one-time setup". The hook never invents a page.
  - The page exists but no `.git`: the hook runs `git init` there and makes a first commit, then continues. (Local-only, no delete, safe.)
- Second node: there is none today. The depot repo has no remote, so one writer (the Workbox). A node without the depot stops with the message above. Later: a clone over Tailscale SSH (`git clone workbox:~/.digismith-depot/history`) for reading, or "our server" (DGS-336 / C.5 Nexus) becomes the one home and gets the remote. A separate ticket.
- A new merge-range line: the script reads the reports from the public repo checkout (cwd), unchanged.

## 4. Every file that names `.digismith/history.html` (grep over the whole repo, excluding `.git`, `node_modules`)
Change in this ticket:
| File | Hits | Change |
|---|---|---|
| `.digismith/hooks/post-finish/03-history-update.md` | 6 | rewrite to the new flow (section 3) |
| `.digismith/hooks/post-finish/scripts/update-history.ts` | 4 | `--history-dir`, env, default; new link base; error messages keep "history.html" |
| `.digismith/hooks/post-finish/scripts/update-history.test.ts` | many tmp-dir tests | tests for flag/env/default, link scheme, depot commit contract; existing 613 lines adapted |
| `README.md` | 7 (lines 6, 35, 48, 62, 75, 92, 229) | say the page lives in the depot on the Workbox, not in the repo; no link into the repo |
| `docs/getting-started.md` | 2 (5, 113) | same |
| `skills/handoff/SKILL.md` | 1 (115) | path becomes the depot page |
| `skills/adopt/SKILL.md` | 1 (12) | historic note about a 2026-08-16 entry; reword to "the history page" |
| `MEMORY.md` | 3 (18, 149, 150) | **I do not touch** (order: letter map is not mine); I report it to the maestro |
Leave as they are (history, not behaviour):
- `backlog/living-history.md` (part 1's), `backlog/history-update-hook-hardening.md`, `backlog/scripture-clan.md`, `backlog/backfill-tickets-for-historical-docs.md`, `backlog/README.md`, `backlog/docs-convention-letter-nesting.md`. Order says no `backlog/` edits.
- About 40 old `.digismith/docs/**/plan.md|design.html|report.html` and `board/**` files: they are frozen records of past work and name the old path as history. Not rewritten.
- `.digismith/sessions/**` (orders, briefs, notes, archives): git-excluded, not mine.
- `.digismith/history.html` itself (12 self-mentions): frozen.
Full hit list saved at `/Users/workbox/.claude/projects/-Users-workbox-Workspace-Jazurite-DigiSmith/756e8696-3eaa-4b4a-9807-119c2b1dfb68/tool-results/bstr42k09.txt` (names and lines).

## 5. Build plan (only after Jack's yes)
1. Worktree + branch `dgs-389` from main (`digismith:init` as needed). Check main clean and no pins under `refs/digismith/post-finish/` before any merge (DGS-383 is running).
2. TDD on `update-history.ts`: failing tests first (flag, env, default, writes `<dir>/history.html` not the repo page, GitHub link base with encoded em dash, `NOTHING` and `APPENDED` outputs unchanged, CRLF kept). Then code. pnpm only.
3. Update hook 03 text, README, getting-started, handoff and adopt skills.
4. One-time setup (not a hook step): copy the page to `~/.digismith-depot/history/history.html`, `cmp` against the repo file (must be identical before the rewrite), `git init` there, first commit "docs(history): import from repo".
5. Rewrite the 265 file links to the GitHub scheme (script run once, regex, count before/after: 256 resolve, 9 dead, 0 others), `cmp`/diff check that only `href` values changed, second commit in the depot repo.
6. Claude whole-branch review, fix verified findings.
7. `report.html` for DGS-389; hook 03 must write this ticket's entry **into the new home**; check it landed in the depot page and was committed there.
8. Merge locally with hooks 01-03, push, only on the maestro's order.
9. **Frozen:** `.digismith/history.html` stays in the public repo untouched until Jack's own yes for `git rm .digismith/history.html`. No history rewrite, no force-push, no Tailscale Serve change.

## Open points for Jack
- Link scheme: GitHub URLs on `main` (recommended) or Workbox-only `file://` paths?
- Depot git has no remote: OK that only the Workbox can write until DGS-336?
- Hook writes to the depot only; once the old repo page is frozen, its timeline stops growing. Accepted (that is the point).
