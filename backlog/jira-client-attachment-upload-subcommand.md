# `jira-client` CLI has no attachment-upload subcommand (only download)

**Status:** Not applied. Confirmed gap, not yet designed.

**Source:** Found live during EMKT-711 (shopify-hub, 2026-09-18) while
trying to get screenshots into a Jira comment — see
[jira-progress-update-screenshots-section.md](jira-progress-update-screenshots-section.md)
for the consuming use case.

## The gap

`packages/jira-client/src/cli.ts` has a `get-attachment` case for
*downloading* an attachment, but nothing for *uploading* one. Uploading
is the missing half needed to get a screenshot into a Jira comment at
all, even via the fallback (non-inline) path.

## Confirmed working approach (classic REST attachments)

```
POST /issue/{key}/attachments
Header: X-Atlassian-Token: no-check
Body: multipart, field name "file"
```

Two dead ends already ruled out for going further than this (see
[jira-media-platform-inline-images.md](jira-media-platform-inline-images.md)
for why true inline embedding needs a completely different, harder flow):
a hand-built ADF `media` node using the classic attachment's numeric ID
(fails `ATTACHMENT_VALIDATION_ERROR` — classic attachment IDs and Media
Platform IDs are different namespaces), and posting a markdown `![]()`
through the official Atlassian MCP connector (silently resolves to a
broken, unauthenticated `blob:` placeholder).

Once uploaded via the classic endpoint, the working fallback is linking
to it in the comment body:
`[label](https://<site>/rest/api/3/attachment/content/<id>)`, and letting
Jack manually drag/paste the image into the Jira UI afterward if true
inline rendering is wanted for that one comment.

## Prerequisite noted, not this item's scope

The Windows CLI entry-point bug this was blocked on is fixed — shipped as **I.5**, 2026-09-18
(see `MEMORY.md`'s I row). This item is unblocked.

Also needs a way to get real image bytes for a screenshot Jack pastes
inline in chat rather than a file already on disk — see the
pasted-image-extraction technique documented in
[jira-progress-update-screenshots-section.md](jira-progress-update-screenshots-section.md).

## Suggested shape

Add an `upload-attachment` (or similar) subcommand to `cli.ts` /
`packages/jira-client/src/` wrapping the classic REST endpoint above,
returning the new attachment's numeric ID and content URL for the caller
(`generate-comment` / `jira-progress-write-back`) to link.

## Why not applied yet

Raw finding, not yet run through `digismith:brainstorming`. Now numbered **I.6** (deferred sub-item
of I, split from what would otherwise have been bundled into I.5) — see `MEMORY.md`'s I row.
