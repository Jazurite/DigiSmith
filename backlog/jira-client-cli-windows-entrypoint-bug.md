# `packages/jira-client/src/cli.ts` silently no-ops every subcommand on Windows

**Status:** Not applied. Confirmed real via direct testing.

**Source:** Found live during EMKT-711 (shopify-hub, 2026-09-18) — a
session ran `check-credentials` and got a false "ok" response with
genuinely blank credentials.

## The bug

`cli.ts:107`'s entry-point guard:

```ts
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
```

never matches on Windows, because Windows paths don't carry the
`file:///` scheme the way `import.meta.url` does — the string comparison
always fails, `main()` never runs, and every subcommand exits 0 with zero
real output. This isn't a narrow edge case: it affects the CLI
unconditionally on this platform, for every subcommand that exists today
and any added later (including the attachment-upload one proposed in
[jira-client-attachment-upload-subcommand.md](jira-client-attachment-upload-subcommand.md)).

Confirmed workaround used in the field: a local wrapper script that
imports the same exported functions directly, bypassing the broken guard
entirely — not a fix, just how the session got unblocked.

## Suggested fix

Something like:

```ts
import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
```

## Why it matters beyond this one bug

Because `main()` never ran, `check-credentials` returned a false "ok"
with blank credentials — i.e. the guard failure doesn't just silently
skip work, it can actively misreport success. **Every subcommand needs
re-verifying once this is fixed**, not just the ones touched during this
session — there's no evidence any of them have ever actually executed on
Windows.

## Why not applied yet

Single confirmed finding, small fix, but flagged for review rather than
patched inline mid-ticket-work on a client repo — `packages/jira-client`
is DigiSmith-owned shared code (provisioned into consumer repos via map
item **V**, Depot), so the fix belongs in a DigiSmith session/PR, not a
shopify-hub one.
