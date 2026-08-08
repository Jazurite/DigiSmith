---
name: jira-intake
description: Use when the user wants to bring a ticket into DigiSmith's workflow — names an existing JIRA/Atlassian ticket by key or pastes its content, or describes a raw feature need with no ticket yet that should be shaped into one.
---

# Jira Intake

## Overview

One entry point, two doors, per DigiSmith's philosophy #4. A ticket
already exists → ingest it (Door 1). No ticket yet, just a need → shape
one (Door 2). Both converge on the same
`.digismith/docs/<slug>/ticket.md` shape. `jira-intake` stops once that
file exists — grounding it in the codebase is **L**, estimating Story
Points is **J**, both separate later stages.

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
2. Target path: `.digismith/docs/<slug>/ticket.md`, in the repo currently
   being worked in — never DigiSmith's own repo, which only hosts this
   skill, not the tickets it processes.
3. **Commit-vs-gitignore, decided once per repo:** before writing into
   `.digismith/docs/` in this repo for the first time, ask git itself
   whether that path is already ignored — don't grep `.gitignore` for a
   literal string:

   ```bash
   git check-ignore -q .digismith/docs/
   ```

   Read the **exit code**, not the (empty) output: **0 = ignored**,
   **1 = not ignored**. Exit code 1 is a normal, expected answer meaning
   "this path is not ignored" — it is *not* a command failure, so don't
   treat it as an error or retry it. `git check-ignore` is authoritative
   where a text match isn't: it correctly resolves a bare `.digismith`
   (no trailing slash), wildcard patterns, negations (`!`), comments,
   nested `.gitignore` files deeper in the tree, `.git/info/exclude`, and
   a global `core.excludesFile` — none of which grepping the root
   `.gitignore` for `.digismith/` would catch.

   Branch on the result:
   - **Ignored (exit 0)** → write gitignored, proceed, no question asked.
   - **Not ignored (exit 1), and nothing under `.digismith/docs/` is
     tracked by git in this repo** → ask once via `AskUserQuestion`
     ("commit this repo's DigiSmith docs, or keep them local-only?").
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
       in this repo.
     - If **committed** is chosen, do nothing further; the entry's
       continued absence is itself the remembered "committed" signal. Note
       that choosing "committed" doesn't itself commit anything — it just
       means the file is left tracked-and-not-ignored, so it becomes part
       of whatever commit the user (or a later skill) makes normally.
   - **Not ignored (exit 1), but `.digismith/docs/` already has files
     tracked by git in this repo** → an earlier write already happened and
     was committed without adding a `.gitignore` entry; treat as
     "committed" (matches the existing files' actual state), don't ask
     again. Confirm tracked-ness with git, not with directory existence:
     ```bash
     git ls-files .digismith/docs/
     ```
     Non-empty output → genuinely committed, don't ask. **Empty output
     while the directory nevertheless exists on disk** (e.g. an aborted
     earlier run left untracked files behind) → that's not evidence of a
     prior decision at all; fall back to the "ask once" branch above
     rather than silently assuming "committed".
4. Check for an existing file at that path first — see Handling Existing
   Files below — before writing.
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

Before writing, check whether `.digismith/docs/<slug>/ticket.md` already
exists:

| Existing file's `Key` | Incoming | Action |
|---|---|---|
| No existing file | — | Write directly |
| Same as incoming key | Door 1, same key (a re-run) | Confirm before overwriting via `AskUserQuestion` |
| Different from incoming key | Door 1, different key, same slug (a collision) | Ask whether to disambiguate — append the ticket key to the slug, or choose a different slug — rather than silently overwriting |
| Blank/absent (a Door 2 draft) | Door 1, now has a real key | Upgrade, not a collision — fill in Key/URL/Story Points on the existing file rather than creating a duplicate or asking about a conflict |
| Any existing file | Door 2 (raw need arrives again at this slug) | Confirm before overwriting via `AskUserQuestion` — same as a Door 1 refresh — regardless of whether the existing file already has a Key set |

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
- **`.digismith/docs/` exists on disk but `git ls-files` reports nothing
  tracked there** → treat it as an aborted earlier run, not as a prior
  "committed" decision; use the ask-once branch.

## Quick Reference

| Step | Action |
|---|---|
| 1 | Determine the door |
| 2a | Door 1: get key, detect JIRA tool, fetch or ask for paste |
| 2b | Door 2: seed from description, ask only what's missing, draft, confirm |
| 3.1–3.2 | Derive the slug; target path is `.digismith/docs/<slug>/ticket.md`, in the repo being worked in — never DigiSmith's own |
| 3.3 | Commit-vs-gitignore, decided once per repo: `git check-ignore -q .digismith/docs/` — exit 0 (ignored) → proceed gitignored; exit 1 (not ignored, *not* an error) + nothing tracked under `.digismith/docs/` → ask once via `AskUserQuestion`, and if gitignored is chosen safely **append** (never overwrite) `.digismith/` to `.gitignore`, newline-guarded; exit 1 + `git ls-files .digismith/docs/` non-empty → treat as committed, don't ask |
| 3.4–3.5 | Branch on any existing file at that path (refresh / collision / upgrade / none), then write the ticket |
