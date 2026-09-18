# `progress-update.md` template is missing a Screenshots/Videos section (Q.1)

**Status:** Not applied. Confirmed real, not yet designed.

**Source:** Learned live during EMKT-711 (shopify-hub, 2026-09-18) — Jack
had to improvise this section by hand because
`skills/generate-comment/templates/progress-update.md` doesn't have it.

## What's missing

Jack's real usage of the "Progress Update" comment shape always includes a
`🖼️ Screenshots / Videos:` section between "What's done" and "Next Steps",
holding either inline images or "N/A". The template Q.1 shipped
(`skills/generate-comment/templates/progress-update.md`) stops at the
`👆 All links...` line and jumps straight to `Next Steps` — this section
was never captured when Q.1 was built.

Real shape, confirmed against Jack's own usage:

```
📣 Progress Update – DD/M
✅ What's done

* <bullet list, plain business language if the audience includes PO/PM —
  no code identifiers, event names, cookie names, tool names>

👆 All links (Preview Theme, Customize, Pull Request, Storybook) are in
the ticket description above.  (optional — only if such links exist)

🖼️ Screenshots / Videos:

<inline images, or "N/A" if none>

🎯 Next Steps:

* <role emoji> <Action> Needed > (@mention1, @mention2, ...) — <ask>
```

Also confirmed on this pass: date format is `DD/M` (e.g. `26/8`), not
ISO — worth double-checking the current template already gets this right
when this item is picked up.

## Why it's not a simple text edit

Filling the section with *real* inline images is the hard part, and it's
currently a dead end — see
[jira-media-platform-inline-images.md](jira-media-platform-inline-images.md).
Until that's built, the practical fallback is uploading screenshots as
classic attachments and linking to them (needs
[jira-client-attachment-upload-subcommand.md](jira-client-attachment-upload-subcommand.md)
first) — and even that fallback needs a way to get the actual bytes of a
screenshot Jack pastes inline in chat, since there's no file on disk for
it. Confirmed technique for that: the image only exists as base64 inside
the session's own transcript JSONL
(`C:\Users\jazurite\.claude\projects\<project-dir>\<session-id>.jsonl`),
under nodes shaped
`{"type":"image","source":{"data":"<base64>","media_type":"..."}}`, and
has to be decoded out of there — there is no temp-file shortcut.

## Suggested shape

1. Add the `🖼️ Screenshots / Videos:` section to
   `skills/generate-comment/templates/progress-update.md` in the position
   shown above, with a content-gathering question for it in
   `skills/generate-comment/SKILL.md` (image bytes or "N/A").
2. When images are provided, use the pasted-image-extraction technique
   above to get real files, then upload them via the attachment-upload
   subcommand (once it exists) and link them per
   [jira-media-platform-inline-images.md](jira-media-platform-inline-images.md)'s
   documented fallback — true inline embedding is future work, not this
   item's scope.
3. Also capture the "What's done" plain-language-for-PO/PM-audience
   wording rule while touching this template — likely overlaps with
   T.6 (audience-filtering voice), see
   `backlog/audience-filtering-voice-t6.md`.

## Why not applied yet

Single raw finding from one live session, not yet run through
`digismith:brainstorming`. Depends on the two items linked above for a
complete design.
