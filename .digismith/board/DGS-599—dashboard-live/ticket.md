# Dashboard: /dashboard/ titled DigiSmith, a Live panel of every herdr agent, role and project filters

**Key:** DGS-599
**Tracker:** ClickUp (https://app.clickup.com/t/14zcebrwj77)
**Status:** in progress
**Priority:** high
**Parent epic:** J.6 Dashboard (DGS-597)

## Description

Jack, 2026-10-24: the dashboard is DigiSmith's control room for the whole factory ("this is not a night watch"); "I want all those on the whole herdr panel".

What
Rename: pages move from /nightwatch/ to /dashboard/ (pazurite.com/dashboard/), page title "DigiSmith". Keep /nightwatch/ as a redirect page to /dashboard/. The API routes stay /api/v1/nightwatch/ for run data.
Live panel: a new "Live" page and a top-bar count: every herdr agent on the Workbox (all workspaces), its name, role (same rule as the automatic run), project, status (working / idle / blocked / done) and its run id when known. Source: herdr agent list read-only through herdr-ws in the Nexus API, cached 5 s, single flight. No pane text is read or shown.
Runs page: filters for role and project; the Maestro and conductor runs show without health flags.
Same gates as DGS-586 (Storybook, visual baselines, Playwright, axe); Warren tokens and notice unchanged.

Needs the automatic runs ticket for the role and project fields on runs; the rename and the Live panel can start before it.

