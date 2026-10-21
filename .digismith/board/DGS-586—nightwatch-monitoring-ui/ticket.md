# Nightwatch monitoring UI

**Key:** DGS-586
**URL:** https://app.clickup.com/t/14zcebrwbvy
**Story Points:** TBD

## Description

A read-only Nightwatch dashboard in the Nexus web app (`scripts/nexus-web/`, Nuxt). It reads run records, event logs, the journal, the attention list and scan status through new Nexus API routes under `/api/v1/nightwatch/`. Screens: top bar, Operations, Attention, Runs, Run detail, Plan. Design source: Warren console (MIT). Full text: `dg clickup get-task DGS-586`.

## Acceptance Criteria

- Screens listed in the ticket exist, with the same gates as Life Calendar (Storybook, visual baselines, Playwright, axe).
- Read-only. Listens on 127.0.0.1, reached through the existing front door.
- Jack reviews the screens at the end.
