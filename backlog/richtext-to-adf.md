# RichText (HTML) to ADF tool for JIRA comments

**ClickUp:** **DGS-263** (list F.7: Report and sync, clan F: Scripture; created 2026-10-10 ~17:3x UTC+7 by the clan F work, task id `14zcebrvctt`).

**Status:** Idea only, confirmed live. No design yet. Filed as a task chip 2026-10-02. Supersedes "support inline code in markdown-to-adf".

**Source:** Live session 2026-10-02 (Claude desktop-app session "Main", manager mode: one Claude session managed herdr worker agents on EMKT-791 and EMKT-810). Full retro: [manager-mode-retro-2026-10-02.md](manager-mode-retro-2026-10-02.md).

## What's wrong

`packages/jira-client/src/markdown-to-adf.ts` is a 141-line homegrown subset converter with no
dependencies. It throws "unsupported construct" for inline code, code blocks, blockquotes,
numbered lists, nested lists, tables, images, and headings other than levels 3 and 4. ADF supports
all of these. On EMKT-810 Jack wanted every file name in inline code. The manager had to convert
without backticks, then hand-add `{"type":"code"}` marks to the ADF JSON before
`add-comment --comment-id`. Jack asked why Markdown is needed at all, and chose RichText (HTML)
as the drafting format.

## The idea

- A new jira-client subcommand, for example `richtext-to-adf --file <draft.html>`, with the same
  output contract as `markdown-to-adf` (an ADF doc on stdout).
- Supported elements: p, strong/b, em/i, code (code mark), a (link mark), ul/ol/li with nesting,
  h1-h6, table/tr/th/td, blockquote, pre/code (codeBlock), hr (rule), mentions (for example
  `<span data-mention-id="accountId">@Name</span>`), literal Unicode emoji. Reject any other tag
  with a clear error.
- Decide between a small HTML-parser dependency and a hand parser for the allowed subset (the
  package is zero-dependency today). Check Atlassian's own libraries.
- Move the templates to HTML. At the review step, show Jack a readable render, not raw HTML.
- Tests for every element, mentions, nested lists, code inside bold, rejected tags.
