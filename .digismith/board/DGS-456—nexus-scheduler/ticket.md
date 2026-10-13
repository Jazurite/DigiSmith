# DGS-456: Nexus scheduler engine (design and plan only)

**Key:** DGS-456
**ClickUp:** 14zcebrvn92 (J.3: Scheduler, list 1301150000003835, clan J: Nexus)
**Source text:** .digismith/sessions/dgs-456/brief.md

DigiSmith's timed jobs run inside the Nexus server on the Workbox, with nobody watching. Jack and `dg schedule` (DGS-457) see and trigger them through a jobs API. Job list and rules: DGS-434 (A.5). Failure comment: DGS-436 via DGS-442; push/email later (DGS-448).
This order: design and plan only. Nothing installed; no sudo, no LaunchAgent, no restart of the running Nexus API or Caddy, no real job run.
