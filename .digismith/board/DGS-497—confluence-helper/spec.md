# DGS-497 Spec: Confluence helper (attach files, place images, read history)

Status: approved by Jack 2026-10-26 (UTC+7), through the conductor. Written 2026-10-26 (UTC+7). Facts checked against `origin/main` 25aae445.

## 1. Purpose

The Atlassian MCP connector writes page bodies and comments. It cannot upload attachments. A page with figures needs every image attached by hand.
A full-body update through the MCP resends 40 to 60 KB of HTML. A stale read can overwrite an edit made in an open editor.

The EMKT-817 run (2026-10-16) proved a REST recipe: upload the PNGs, put each image in the page, check the page version. This ticket turns that recipe into a command set that any session can call.

## 2. Scope

In (v1):

| Command | Does |
|---|---|
| `attach <pageId> <files...>` | Uploads each file to the page. Prints one line per file: page id, file name, file id, collection. |
| `place-images <pageId> --map "<placeholder>=<file>[:caption]" ...` | Replaces each placeholder text in the page body with an image. |
| `history <pageId>` | Lists the page versions (number, date, author, autosaved or not). |
| `diff <pageId> <v1> <v2>` | Prints a text diff of two versions. |

Out of v1:

- `update-section <pageId> <heading>` (edit one section, keep local IDs and comment anchors). It is the only command that fixes the "resend 40 to 60 KB" problem. It needs a storage-format parser and carries the most risk. It gets its own ticket after v1 proves the version check and anchor check. See Open question 2.
- Creating pages, deleting pages or attachments, editing comments. Not asked for.
- Any Jira work. The Jira commands in the same package stay as they are.

## 3. Where it lives (technical decisions)

**D1. Home: the existing `packages/jira-client`, new file `src/confluence.ts`, new subcommands in `src/cli.ts`.**
Reason: it already has the credential reader (`checkCredentials`, reads `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_SITE` from `~/.digismith-depot/.env`), the Basic auth header, an upload helper pattern, a vitest setup, and skills that already call it by the depot path (`~/.digismith-depot/repo/packages/jira-client/src/cli.ts`). Jira and Confluence use the same Atlassian site and the same token. A second package would copy the credential code.
The package name says "jira". Renaming it is out of scope. If Jack opens an Atlassian lineage (Open question 1), the rename can ride on that.

**D2. No `dg confluence` group in v1.**
Reason: `dg` has no Jira group today. The Jira helper is a package CLI plus skills. Following that pattern keeps one way to reach Atlassian. A `dg` front for both can come later as one ticket in the Atlassian lineage.

**D3. A skill ships with the commands: `digismith:confluence`.**
It tells a session how to run the flow (generate figures, attach, place inline) and where the approval stops are. The "Jack approves every page write" rule lives in the skill, because a CLI cannot know who approved.

**D4. Credentials.**
Only the three variable names above. They are read inside the process and go only into the `Authorization` header. They are never printed, logged or put in an error text. Error output carries the HTTP status and the response body, never the request headers. The EMKT-817 script used `ATLASSIAN_EMAIL` and `ATLASSIAN_API_TOKEN`; the helper does not. It uses the `JIRA_*` names, as the ticket says and as the code does.

**D5. Dry run by default. Writes need `--apply`.**
`attach` and `place-images` without `--apply` print what they would do (files, target page, placeholders found, version, marker count) and change nothing. With `--apply` they write. The skill runs the dry run, shows it to Jack, and runs `--apply` only after his yes. This turns the constraint "Jack approves every page write" into something a command line can enforce.

## 4. Behaviour

### 4.1 attach
`PUT {site}/wiki/rest/api/content/{pageId}/child/attachment`, header `X-Atlassian-Token: nocheck`, multipart `file` and `minorEdit=true`.
It creates the file, or a new version when the name exists. Reads `extensions.fileId` and `collectionName` from `results[0]`. Files go one at a time, in the order given. On the first failure it stops and reports which files were done.

### 4.2 place-images
1. `GET /wiki/rest/api/content/{id}?expand=body.storage,version`. Keep `version.number` and the body.
2. For each `placeholder=file[:caption]` pair: the placeholder text must appear exactly once in the body. Zero or more than one is an error, and nothing is written.
3. Replace it with `<ac:image ac:width="760"><ri:attachment ri:filename="<file>" /><ac:caption>…</ac:caption></ac:image>`. The file name and caption are XML-escaped. The width default is 760 (the proven value); `--width` overrides it. The caption is optional.
4. Count `<ac:inline-comment-marker` before and after. If the count changed, stop and write nothing.
5. `PUT /wiki/rest/api/content/{id}` with `version.number + 1` and the new body. The version check is mandatory and has no flag to skip it.
6. HTTP 409 means the page changed after the read. The command reports it, writes nothing, and does not retry. The caller re-reads and decides. A 409 is the safe outcome.
The attachment must already exist on the page. The command checks the attachment list first and fails with a clear message if a file is missing.

### 4.3 history and diff
`history`: `GET /wiki/api/v2/pages/{id}/versions`. Marks autosaved versions (they come from an open editor).
`diff`: `GET /wiki/rest/api/content/{id}?status=historical&version=N&expand=body.storage` for both versions, then a line diff. The storage format is split at tag boundaries first, so a one-word change shows as one line. Read-only, no `--apply`.

### 4.4 Errors and exit codes
Exit 0 on success (and on a dry run). Exit 1 on any failure, with one plain line on stderr that names the step and the HTTP status. 409 gets its own message. Output on stdout is tab-separated lines (attach, history) or plain text (diff), so a script can read it.

## 5. Testing

- Unit tests with vitest and a mocked `fetch`, in the style of `client.test.ts`. Cover: the upload request shape, placeholder found zero, one and many times, marker count changed, 409 passes through without a retry, XML escaping of caption and file name, dry run sends no write request, credentials never appear in any thrown message or output.
- One live check, run by Jack's order on a scratch page: attach one PNG, place it, read the page. This is the only step that touches real Confluence. The build itself does not need it.

## 6. Constraints carried from the ticket

- Never print or log the credentials.
- Jack approves every page write (D5 and the skill).
- The version check is mandatory.
- Comment anchors must survive: fail if the marker count changes.

## 7. Decisions (were open questions; Jack answered 2026-10-26)

Both answers match my recommendations below. 1: lineage = new D.x Atlassian Channel (the ticket moves when the lineage exists; a separate step, not part of this build). 2: `update-section` = a later separate ticket.

Original text:

**1. Lineage (not decided here, ticket not moved).** The ticket sits in D.0 Pavilion because no Atlassian lineage exists. `dg clickup` lives in D.3 ClickUp Channel.
My recommendation: open a new lineage "D.x Atlassian Channel". Reason: `jira-client` already exists with no lineage, and this ticket adds Confluence to it. Two Atlassian tools justify a lineage, and a later `dg` front or a rename has a home. The spec does not depend on the answer: the code path is `packages/jira-client` either way.

**2. Scope: is `update-section` a separate later ticket?**
My recommendation: yes, later. v1 covers upload and placement (the proven part). `update-section` is new, riskier work and needs the v1 safety checks first. If Jack wants it inside this ticket, the ticket grows and the plan gets a second phase.

## 8. Proposed Sign-off and Mode (for the Refiner check)

Sign-off: Auto. The contract is fully defined (commands, flags, checks). It is an internal tool with no look or wording to judge.
Mode: Manual. The live check writes to real Confluence and needs Jack present; the factory must not claim it.
