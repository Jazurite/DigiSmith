# Jira: stop depending on the Atlassian MCP connector, call REST/GraphQL directly

**Status:** Not applied. Raw idea only — needs a design spec before
becoming a skill/infra change. Affects the **shared "JIRA write-back"
primitive** (`MEMORY.md`'s map footnote) that `I.1` currently sits on
top of, not a new letter itself.

**Source:** Hit repeatedly in one EMKT-756 session using
`digismith:jira-progress-write-back` (`I.1`), all against the same
Atlassian Rovo MCP connector:

1. `getJiraIssue` with `responseContentFormat: "adf"` returned real ADF
   for `comment.comments[].body`, but the `description` field came
   back as a lossy rendered-markdown hybrid (`<custom data-type="...">`
   tags standing in for tables/status-lozenges/emoji) — not real ADF,
   despite the same request parameter. Reconstructing a description
   edit from that lossy string risks corrupting the live document, so
   `I.1`'s description-write step had to be skipped entirely for this
   run.
2. No tool in the connector's surface downloads attachment/media
   binary content. A comment referenced a screenshot (the actual
   substance of a stakeholder's feedback); the only text was "feedback
   from Shoko," and nothing in the MCP toolset could open the image
   itself.
3. Confirmed the underlying Jira REST endpoint
   (`/rest/api/3/attachment/content/{id}`) does exist and does support
   raw binary content — `getJiraIssue` with `fields: ["attachment"]`
   returns a direct content URL — but hitting it via `WebFetch` 403'd
   (no Atlassian auth available outside the MCP connector's own
   internal OAuth token, which isn't exposed to the calling session).
4. The MCP server itself disconnected and reconnected multiple times
   mid-session under a new random tool-name UUID prefix each time
   (`mcp__f184b9b2-...` → `mcp__2c006f0d-...`), which is itself a
   reliability cost on top of the capability gaps above.

## What this covers

Replace the Atlassian Rovo MCP connector as the transport for anything
Jira-related in DigiSmith (today: `I.1`; potentially future stages
that touch Jira) with direct calls to Jira's own REST API v3 (or
GraphQL, where Atlassian's schema covers the same ground) — same
scope the MCP connector covers today (issue read, description/comment
write, ADF), plus the two gaps above (real ADF for every field, raw
attachment content).

Each user supplies their own Jira/Atlassian **personal API token**
(generated at `id.atlassian.com/manage-profile/security/api-tokens`),
used with HTTP Basic Auth (`email:token`) directly against
`https://<site>.atlassian.net/rest/api/3/...` — not the
`api.atlassian.com/ex/jira/{cloudId}/...` gateway, which is
OAuth-app-only and is what 403'd during this session's WebFetch test.

## Why this fixes today's three gaps

- **Real ADF everywhere:** the direct REST API's own
  `?expand=renderedBody`/body-format params are well-documented and
  consistent per-field, unlike whatever the MCP connector does
  internally to produce its "adf" response — no more field-by-field
  surprises about what's actually ADF vs. rendered text.
- **Attachment content:** `/rest/api/3/attachment/content/{id}` is a
  plain authenticated GET — trivial once real auth is available.
- **Connector reliability:** a `curl`/HTTP call from a script has no
  MCP-server lifecycle to disconnect/reconnect mid-session.

## Security / secret-handling concern (must be resolved in the design spec)

The token **must not** land in `profiles/<name>.yml` (or anywhere
else DigiSmith commits per its "record decisions in plain,
git-committed text" convention) — that file is real git history,
potentially shared/backed up. Needs its own mechanism: an env var
name referenced *by* the profile (not the token itself), an OS
credential store, or a gitignored local file the profile points at.
This is the first thing a design spec needs to settle — don't let the
convenience of "just working" ship a plaintext-committed-token
footgun.

## Suggested shape

- A new profile field (extends map item **O**) naming where to find
  the token (env var / file path), not the token's value.
- A small shared helper (`scripts/jira_api.py` or similar, mirroring
  the existing `scripts/model_offload.py` pattern from **K.1**) that
  every Jira-touching skill calls instead of an MCP tool: `get_issue`,
  `update_description`, `add_comment`, `get_attachment_content`, etc.
- `I.1` (`digismith:jira-progress-write-back`) becomes the first
  consumer to migrate; its "map to whatever this session's connector
  calls things" caveat goes away entirely once there's one fixed
  interface instead of an arbitrary MCP server's tool names.

## Confirmed later in the same session

Once a personal API token was actually in hand, direct REST calls
(`GET /rest/api/3/issue/{key}?fields=description` and
`GET /rest/api/3/attachment/content/{id}`, both via `curl -u
email:token`) worked exactly as this item predicted: real nested ADF
for `description` (proper `status`/`expand`/`table` nodes, not the
lossy `<custom>`-tag hybrid the MCP tool returned for the same field),
and a clean attachment download. Confirms the fix is real, not
speculative — the gap is specifically in the MCP connector's own
internal rendering, not in what Jira's API can provide.

## In-page anchor links to a description heading — tried, doesn't actually work

`GET .../issue/{key}?fields=description&expand=renderedFields` returns
server-rendered HTML with a named anchor per heading (e.g.
`<h2><a name="🔗Materials&amp;Links:"></a>...`), which looked like it
would support a same-document fragment link
(`https://<site>.atlassian.net/browse/{KEY}#<url-encoded-heading-text>`)
that scrolls without reloading. **Tried live on EMKT-756 and it
doesn't hold**: Jira's actual issue view is a client-rendered SPA, not
the static HTML `renderedFields` returns — clicking the link caused a
full page reload instead of an in-page scroll. The anchor exists in
the export/print HTML representation only; it isn't honored by the
live app's own routing. Don't reach for this technique again without
re-verifying against the real SPA first (`renderedFields` output is
not a reliable proxy for live-page behavior).

## Track template convention, learned while editing EMKT-756's description

The `📦 Track` section's stage list (Technical Development → Storybook
Conversion → Design Review → Documentation → **QA** → Engineering Code
Review → Rollout) has one stage whose plain label is misleading: "QA"
actually covers both QA testing *and* getting each market's business
side (PO/WO/country stakeholder) to confirm the fix looks right on
their preview link — i.e. it's the same gate as `I.1`'s implicit
"country confirmation" step. Renamed to **"Business Acceptance"** on
EMKT-756 per direct request (considered "QA & Country Approval" and
"QA & Business Acceptance" first, landed on dropping "QA" entirely
since the label's job is to name the *gate*, not enumerate everything
that happens before it). Worth carrying into whatever template
`I.1` (or its REST-based successor) generates for a fresh ticket's
Track section, so future tickets start with the accurate label instead
of "QA" needing the same correction every time.

## Related: this is where `I.1` actually broke live

The MCP `description`-field bug above isn't hypothetical — it's exactly
where `I.1`'s own Step 4 (`skills/jira-progress-write-back/SKILL.md`,
"Fetch the Current Ticket ... always ADF here, never markdown") sits.
This item was hit *during a real invocation of the shipped skill*, not
discovered by separate testing — the first live run this skill has ever
had needed its description-write step skipped entirely because of it.
See [[project_pr-automation-feature-pending]] for the memory-side
record of that live-run outcome.

The same session also hand-built a Track-section template
([[track-section-template.md]]) entirely via the direct-REST workaround
described above, since there was no working skill path for it. That
item's own "Tension with I.1's current scope" section is worth reading
before this backlog item becomes a design spec — the REST migration and
the Track template are two halves of the same unblock.

## Why not applied yet

Single-session pain, not yet run through
`superpowers:brainstorming`. No profile-field design for token storage
yet (see security concern above — that has to be solved, not
hand-waved, before this becomes a skill).
