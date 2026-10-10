# Nexus API service: the backend that serves the Workbox's power metrics over a URL

**Status:** Idea, Jack (2026-10-10 ~21:3x UTC+7 [14:3xZ]). ClickUp: **DGS-324** (C.5: Nexus, task id `14zcebrvcyn`). No design yet.

## Why

Jack checks the Mac's heat and load often and has to run `workbox-health` by hand with his sudo password (DGS-319). He wants a backend on
Nexus: hit a URL, get the current power metrics.

## Shape

- A small HTTP service on **C.5 Nexus** (the software server on the Workbox), tailnet only, reached by a Tailscale Serve path (hosting
  pattern: DGS-323), with a login like the OpenCode server.
- `GET /power-metrics` returns the current reading as JSON: CPU and GPU die temperature, fan, thermal pressure and CPU level, prochots, CPU
  idle, load, memory free, top processes, the OpenCode server's memory.
- **No password typing:** a root collector limited to `powermetrics` (a LaunchDaemon, Jack installs) feeds it; the API itself runs without
  root.
- Source in the repo, runtime in the depot (DGS-265). More endpoints later (list of services, health checks).

## Split with C.4

This ticket is the **backend API** (Nexus). **DGS-322** (C.4: Observability) is the stack that stores and charts the data (time-series
database, Grafana) and can read this API.
