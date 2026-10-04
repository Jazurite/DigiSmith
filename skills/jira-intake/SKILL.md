---
name: jira-intake
description: Use when the user wants to bring a ticket into DigiSmith's workflow — names an existing JIRA/Atlassian ticket by key or pastes its content, or describes a raw feature need with no ticket yet that should be shaped into one.
---

# Jira Intake

## Overview

One entry point, two doors, per DigiSmith's philosophy #4. A ticket
already exists → ingest it (Door 1). No ticket yet, just a need → shape
one (Door 2). Both converge on the same Ticket Template shape, written to
`.digismith/board/<KEY>—<slug>/ticket.md` when a real key is in hand or
`.digismith/docs/<slug>/ticket.md` otherwise (Step 3.2). `jira-intake` stops
once that file exists — grounding it in the codebase is **L**, estimating
Story Points is **J**, both separate later stages.

## When to Use

The user names an existing ticket — a key, a URL, or ticket text to paste
— use Door 1. The user describes a need with no ticket yet — use Door 2.

## Process

### Step 1: Determine the Door

If not already obvious from what the user said, ask which applies: does a
ticket already exist, or are we shaping one from a raw need?

### Step 2a (Door 1): Ticket Exists

1. Ask for the ticket key.
2. Check whether a JIRA/Atlassian-capable tool is available in this
   session (see JIRA Detection below).
   - Available → fetch the ticket by key.
   - Not available → say so plainly, ask the user to paste the ticket
     content directly.
3. Neither a tool nor a pasted-content answer available (user declines to
   paste) → stop cleanly (see Error Handling). Don't fabricate a ticket.
4. Pasted content too sparse to extract a title/description → say so,
   offer a cleaner paste or switching to Door 2 instead (see Error
   Handling).
5. Map the result into the Ticket Template. No confirmation step here —
   this is transcription of already-real content, not a draft.
6. Continue to Step 3 (Write).

### Step 2b (Door 2): Raw Need → Shaped Ticket

1. Take the user's description as the seed.
2. Check what's still missing for the required fields (Title,
   Description, Acceptance Criteria). If everything needed is already
   inferable from what was said, skip straight to drafting — don't ask a
   question whose answer was already given.
3. Otherwise ask only for what's missing, one question at a time via
   `AskUserQuestion` — never a batch of questions for information already
   inferable from what was said.
4. Draft the ticket using the Ticket Template (Key/URL omitted entirely,
   Story Points "TBD").
5. Confirm the draft with the user before writing — same ask → draft →
   confirm shape `digismith:discover-standards` already uses.
6. Continue to Step 3 (Write) once confirmed.

### Step 3: Derive the Slug and Write

1. Derive the slug from the title: lowercase, drop filler words (a, an,
   the, on, to, of, for, in), replace remaining non-alphanumeric runs with
   a single hyphen, then truncate to ~40 characters at a word boundary —
   never leaving a trailing filler word or hyphen. Example: "Fix cart
   drawer padding on mobile checkout" → `fix-cart-drawer-padding-mobile`.
   Determinism matters here: two independent runs for the same feature
   must land on the same slug, or the Handling Existing Files table below
   never fires.
2. **Target path depends on whether this ticket has a real key**, not on
   the active profile. A real `**Key:**` is set (Door 1 succeeded, or an
   earlier Door 2 draft is now being upgraded) → run the script's
   `--action path --key <key> --title <title>` (see "The Script" below;
   prints `.digismith/board/<KEY>—<slug>/ticket.md`). No key yet (a fresh
   Door 2 draft, or any repo with none supplied) →
   `.digismith/docs/<slug>/ticket.md`, exactly as before this ticket —
   `docs/` is that ticket's real, permanent home, not a holding pen.
   Either way, the target is in the repo currently being worked in —
   never DigiSmith's own repo, which only hosts this skill, not the
   tickets it processes.
3. **Commit-vs-gitignore, decided once per repo:** before writing for the
   first time in this repo, ask git itself whether this write's own
   target folder is already ignored — the board folder when a key is in
   hand, the docs folder when it isn't. Check only that one target, never
   the other: a repo can ignore one and still track the other.

   ```bash
   git check-ignore -q .digismith/board/   # when a key is in hand
   git check-ignore -q .digismith/docs/    # when there is no key
   ```

   Read the **exit code**, not the (empty) output: **0 = ignored**,
   **1 = not ignored**. Exit code 1 is a normal, expected answer meaning
   "this path is not ignored" — it is *not* a command failure, so don't
   treat it as an error or retry it. `git check-ignore` is authoritative
   where a text match isn't: it correctly resolves a bare `.digismith`
   (no trailing slash), wildcard patterns, negations (`!`), comments,
   nested `.gitignore` files deeper in the tree, `.git/info/exclude`, and
   a global `core.excludesFile` — none of which grepping the root
   `.gitignore` for a literal string would catch.

   Branch on the result:
   - **Ignored (exit 0)** → write gitignored, proceed, no question asked.
   - **Not ignored (exit 1), and nothing under *either* folder is tracked
     by git in this repo** → ask once via `AskUserQuestion` ("commit this
     repo's DigiSmith docs, or keep them local-only?"). This "already
     tracked" check always looks at both folders together, regardless of
     which one this write targets — an earlier decision recorded under
     either folder still answers the question for both:

     ```bash
     git ls-files .digismith/board/ .digismith/docs/
     ```

     - If **gitignored** is chosen, append the entry to this repo's
       `.gitignore` — safely, never by rewriting the file:
       1. If `.gitignore` doesn't exist at all, create it containing the
          single line `.digismith/`. Done.
       2. If it does exist, **read its current content first**.
       3. If that content doesn't already end in a newline, add one — an
          otherwise-valid last line would silently fuse with the entry
          you're appending and corrupt both.
       4. Then append one new line: `.digismith/`.
       5. Use an append operation. Never use a tool or redirect that
          replaces the whole file's content (`>` rather than `>>`, or a
          whole-file write) — that would clobber every existing rule in
          the repo's `.gitignore`.

       Its presence is now the remembered answer for every future session
       in this repo, covering `board/` and `docs/` alike (one bare
       `.digismith/` line is a prefix match over the whole tree).
     - If **committed** is chosen, do nothing further; the entry's
       continued absence is itself the remembered "committed" signal. Note
       that choosing "committed" doesn't itself commit anything — it just
       means the file is left tracked-and-not-ignored, so it becomes part
       of whatever commit the user (or a later skill) makes normally.
   - **Not ignored (exit 1), but either folder already has files tracked
     by git in this repo** → an earlier write already happened and was
     committed without adding a `.gitignore` entry; treat as "committed",
     don't ask again. Confirm tracked-ness with git, not with directory
     existence — same `git ls-files .digismith/board/ .digismith/docs/`
     command as above. Non-empty output → genuinely committed, don't ask.
     **Empty output while either directory nevertheless exists on disk**
     (e.g. an aborted earlier run left untracked files behind) → that's
     not evidence of a prior decision at all; fall back to the "ask once"
     branch above rather than silently assuming "committed".
4. Check for an existing file at the target path first — see Handling
   Existing Files below — before writing.
5. Write the file in the Ticket Template shape.

## Ticket Template

```
# <Title>

**Key:** EMKT-1234 (Door 1 only — omitted if the ticket doesn't exist yet)
**URL:** https://... (Door 1 only — include only if actually fetched or supplied by the user; never construct one from the key)
**Story Points:** 3 (captured as-is if already set; otherwise "TBD" — jira-intake never estimates)

## Description

...

## Acceptance Criteria

- ...
- ...
```

## JIRA Detection

Door 1 doesn't assume any specific JIRA integration exists. At runtime,
check whether a JIRA- or Atlassian-capable tool is available in the
current session — same principle `digismith:inject-standards` already
uses for its own scenario detection: infer from what's actually
available, don't hardcode an assumption. Found → use it to fetch the
ticket by key. Not found → tell the user plainly and ask them to paste
the ticket content instead. Never block on JIRA access that doesn't exist
in this environment today.

## Handling Existing Files at the Target Slug

Before writing, look for an existing ticket file at this slug: run the script's
`--action find --slug <slug>` (see "The Script" below) against `.digismith/board/`
first — it matches regardless of that folder's own key; a non-empty result names the
folder. Nothing printed → fall back to the flat `.digismith/docs/<slug>/ticket.md`
check (unchanged).

| Existing file's `Key` | Incoming | Action |
|---|---|---|
| No existing file (neither location) | — | Write directly, at the target path Step 3.2 resolves |
| Same as incoming key | Door 1, same key (a re-run) | Confirm before overwriting via `AskUserQuestion` |
| Different from incoming key | Door 1, different key, same slug (a collision) | Ask whether to disambiguate — append the ticket key to the slug, or choose a different slug — rather than silently overwriting |
| Blank/absent, found under `docs/<slug>/` (a Door 2 draft) | Door 1, now has a real key | Upgrade, not a collision — **move** the whole `.digismith/docs/<slug>/` folder (`ticket.md` and anything already sitting beside it) to the path `--action path --key <key> --title <title>` prints, then fill in Key/URL/Story Points on the moved `ticket.md` — the same move-and-correct idiom `digismith:adopt` Step 3.2 already uses for its own branch-slug correction |
| Any existing file | Door 2 (raw need arrives again at this slug) | Confirm before overwriting via `AskUserQuestion` — same as a Door 1 refresh — regardless of whether the existing file already has a Key set |

## The Script

`<digismith-root>` is two levels up from this skill's base directory (shown when the skill
loads). Use this copy, not a path asked from the human partner: the script and this text ship
together in one plugin version.

```bash
node --experimental-strip-types <digismith-root>/scripts/board-path.ts --action path --key '<key>' --title '<title>'
node --experimental-strip-types <digismith-root>/scripts/board-path.ts --action find --slug '<slug>'
```

Wrap `<title>`/`<slug>` in single quotes, and write any `'` inside either as `'\''`.

## Error Handling

- **No JIRA tool and the user declines to paste** → stop cleanly: explain
  that `jira-intake` needs either a JIRA tool in this session or pasted
  ticket content to proceed. Don't fabricate a ticket.
- **Pasted content too sparse** to extract a title/description → say so,
  offer either a cleaner paste or switching to Door 2's raw-need flow
  instead.
- **Existing file at the target slug** → see Handling Existing Files
  above; branch by the table, never silently overwrite.
- **`git check-ignore -q` exits 1** → not an error. It's the normal
  "this path is not ignored" answer; continue into Step 3.3's
  not-ignored branch. (Only exit 0 means ignored.)
- **Either ticket-file folder exists on disk but `git ls-files` reports
  nothing tracked there** → treat it as an aborted earlier run, not as a
  prior "committed" decision; use the ask-once branch.

## Quick Reference

| Step | Action |
|---|---|
| 1 | Determine the door |
| 2a | Door 1: get key, detect JIRA tool, fetch or ask for paste |
| 2b | Door 2: seed from description, ask only what's missing, draft, confirm |
| 3.1–3.2 | Derive the slug; target path is `boardRelPath(key, title)` when the ticket has a real key, `.digismith/docs/<slug>/ticket.md` otherwise (unchanged) — in the repo being worked in, never DigiSmith's own |
| 3.3 | Commit-vs-gitignore, decided once per repo: `git check-ignore -q` on this write's own target only (`.digismith/board/` when keyed, `.digismith/docs/` otherwise — never the other one) — exit 0 (ignored) → proceed gitignored; exit 1 (not ignored, *not* an error) + nothing tracked under **either** folder (`git ls-files .digismith/board/ .digismith/docs/` empty) → ask once via `AskUserQuestion`, and if gitignored is chosen safely **append** (never overwrite) `.digismith/` to `.gitignore`, newline-guarded; exit 1 + that same `ls-files` non-empty → treat as committed, don't ask |
| 3.4–3.5 | Branch on any existing file at that path (refresh / collision / upgrade / none), then write the ticket |
