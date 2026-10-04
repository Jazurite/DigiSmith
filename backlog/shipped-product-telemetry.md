# Shipped-product telemetry: instrument the deployed theme or app

**Status:** Idea, an old open question from `MEMORY.md` (decomposed 2026-08-12 during map item **P**'s brainstorm), filed 2026-10-04 by the
maestro at Jack's yes. Undesigned and unscoped; "pick this up as its own brainstorm when it's actually wanted, not preemptively".
ClickUp: **DGS-168** (list D.1: Runtime Services; Jack can move it, created 2026-10-04 10:40 UTC+7 [03:40Z], task id `14zcebruqt7`).

**Source:** `MEMORY.md`, the frozen "Open questions" entry "Shipped-product telemetry has no map letter or design".

## What it is

Originally proposed alongside **P** (Telemetry) as "log every action for data collection". It covers the **deployed** theme or app's own
runtime behavior, for example post-deploy Shopify storefront user behavior. Map item **P** covers DigiSmith's own process only
(`digismith:telemetry`).

The two are unrelated engineering problems with no shared infrastructure. This one is a client-side instrumentation, a collection
endpoint and a data pipeline. It is not a DigiSmith-session-transcript problem.

## Under ticket-based naming

It needs no map letter. It needs a ticket, which is this one.

## Open questions

- Which product first: an Emma Shopify theme, or something else.
- Where the collection endpoint and pipeline live (the Depot's runtime services, or outside DigiSmith).
- Privacy and consent for storefront users.
- Whether it is DigiSmith's job at all, or a template DigiSmith's workflow produces.

## Related

`digismith:telemetry` (map item **P**, DigiSmith's own process), [dg-workbox-package.md](dg-workbox-package.md), the frozen
`MEMORY.md` entry.
