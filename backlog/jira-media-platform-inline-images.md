# Real inline image embedding in Jira comments needs the Media Platform upload flow

**Status:** Not applied. Two approaches already ruled out; real flow not
yet scoped.

**Source:** Investigated live during EMKT-711 (shopify-hub, 2026-09-18)
while trying to make `🖼️ Screenshots / Videos:` sections (see
[jira-progress-update-screenshots-section.md](jira-progress-update-screenshots-section.md))
contain true inline images instead of links.

## The problem

Jira Cloud's inline Media Platform uses a completely separate UUID-based
ID namespace from classic `/issue/{key}/attachments` uploads. A comment's
real ADF shape for an inline image, confirmed by fetching a comment after
Jack inlined images himself in the Jira UI:

```json
{
  "type": "mediaSingle",
  "attrs": { "width": <px>, "widthType": "pixel", "layout": "align-start" },
  "content": [
    {
      "type": "media",
      "attrs": {
        "type": "file",
        "id": "<media-platform-uuid>",
        "collection": "",
        "height": <px>,
        "width": <px>
      }
    }
  ]
}
```

`collection: ""` is correct as shown — the problem is `id`: it must be a
real Media Platform UUID obtained through that platform's own
upload-context flow. Two approaches already tried and confirmed **not**
to work:

1. A hand-built ADF `media` node using the classic attachment's numeric
   ID instead of a Media Platform UUID → `ATTACHMENT_VALIDATION_ERROR`.
2. A markdown `![]()` image posted through the official Atlassian MCP
   connector → resolves to a broken, unauthenticated `blob:` external
   -media placeholder, not a real embed — fails silently (no error, just
   a dead image).

## What's needed

The actual Media Platform upload flow: request an upload context/token
from Jira's Media API, upload the file bytes to that context, then
reference the resulting Media Platform UUID in the ADF `media` node shown
above. Not yet investigated in detail — this item is "here's the wall we
hit and the confirmed target shape," not a design.

## Until this exists

Fallback documented in
[jira-client-attachment-upload-subcommand.md](jira-client-attachment-upload-subcommand.md):
classic attachment upload + a markdown link in the comment body, with
Jack manually pasting the image into the Jira UI afterward if inline
rendering is wanted for that specific comment.

## Why not applied yet

Genuinely unscoped — needs research into Jira's Media API upload-context
flow before this can even become a design spec. Bigger and less certain
than the other three items this session surfaced.
