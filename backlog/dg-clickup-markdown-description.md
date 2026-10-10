# Add Markdown descriptions to dg clickup: --markdown-description on create-task and update-task (public API)

**Status:** Idea, found live (2026-10-10 16:30 UTC+7 [09:30Z]). ClickUp: **DGS-230** (D.3: ClickUp Channel, task id `14zcebrvcqa`). Bucket: Public API (not set: `dg`
has no command to set a custom field). No design yet.

## Why

ClickUp renders Markdown in a task description only through the `markdown_description` field of the public API (create
and update task). The plain `description` field shows text as-is, and there is no HTML description field. `dg clickup
create-task` and `update-task` send only `description` (`packages/cli/src/clickup/lib.ts`), so every description that
`dg` or the backlog sync (`~/.digismith-depot/backlog-sync/sync.py`) writes shows raw Markdown: `**`, `#`, fences.

Found on 2026-10-10 while putting a tutorial article into a ticket description; Jack: "the description is in Markdown,
but the article is in HTML".

## What is proven, what is not

- Proven: `dg clickup create-task --description` and `update-task --description` work with long text (a 37,000-character
  description passed as one argument).
- From ClickUp's docs, not tested here: `markdown_description` on create and update; supported syntax is headings,
  emphasis, lists, links, images, block quotes, inline code and code blocks; `include_markdown_description` on GET task
  returns it. Community reports name other fields (`markdown_content`, `description_markdown`) and a round-trip bug;
  check the live API before relying on them.

## Shape (to confirm)

- `--markdown-description <text>` and `--markdown-description-file <path>` on `create-task` and `update-task`, mutually
  exclusive with `--description` (as `update-list` already has `--description-file`).
- `get-task --markdown` to read it back with `include_markdown_description=true`.
- Then switch `sync.py` (or the future `dg backlog sync`) to the Markdown field, and re-sync the existing mirrored
  descriptions.
- First use: re-send the Tailscale and Proton article ticket's description as rendered Markdown.

## Related

- DGS-218 (task type support, the same "option on existing commands" shape), DGS-137 (`update-list
  --description-file`).
- [backlog-item-gets-clickup-task.md](backlog-item-gets-clickup-task.md) (DGS-163): the sync rule this would upgrade.
- DGS-229 ([article-writing-standard.md](article-writing-standard.md)): the article that hit this gap.
