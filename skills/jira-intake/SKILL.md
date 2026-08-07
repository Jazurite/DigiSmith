---
name: jira-intake
description: Use when the user wants to bring a ticket into DigiSmith's workflow — names an existing JIRA/Atlassian ticket by key or pastes its content, or describes a raw feature need with no ticket yet that should be shaped into one.
---

# Jira Intake

## Overview

One entry point, two doors, per DigiSmith's philosophy #4. A ticket
already exists → ingest it (Door 1). No ticket yet, just a need → shape
one (Door 2). Both converge on the same `docs/<slug>/ticket.md` shape.
`jira-intake` stops once that file exists — grounding it in the codebase
is **L**, estimating Story Points is **J**, both separate later stages.

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
2. Target path: `docs/<slug>/ticket.md`, in the repo currently being
   worked in — never DigiSmith's own repo, which only hosts this skill,
   not the tickets it processes — gitignored, matching the existing
   convention for specs/plans/reports in that same folder.
3. Check for an existing file at that path first — see Handling Existing
   Files below — before writing.
4. Write the file in the Ticket Template shape.

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

Before writing, check whether `docs/<slug>/ticket.md` already exists:

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

## Quick Reference

| Step | Action |
|---|---|
| 1 | Determine the door |
| 2a | Door 1: get key, detect JIRA tool, fetch or ask for paste |
| 2b | Door 2: seed from description, ask only what's missing, draft, confirm |
| 3 | Derive slug, branch on existing file (refresh / collision / upgrade / none), write `docs/<slug>/ticket.md` |
