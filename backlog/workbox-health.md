# workbox-health: one command for the Mac Workbox's heat, fan, CPU idle and memory, with a history log

**Status:** v1 built, Jack (2026-10-10 ~20:3x UTC+7 [13:3xZ]). ClickUp: **DGS-319** (G.2: Observability, task id `14zcebrvcye`). First ticket of
the new lineage **G.2: Observability** in clan G (name of clan G still open), next to G.1: Telemetry.

## Why

Jack checks `sudo powermetrics` often (heat after long agent runs, the OpenCode server's memory). One command, run any time, with a history.

## v1 (built 2026-10-10)

- Source: `scripts/workbox-health/workbox-health.sh`; `scripts/workbox-health/install.sh` copies it to `~/.digismith-depot/bin/workbox-health`
  (the repo holds the source, the depot runs it: DGS-265).
- One run prints: time (UTC+7), CPU and GPU die temperature, fan rpm, thermal pressure and CPU level, prochots (`sudo powermetrics
  smc,thermal`, one 1 s sample), CPU idle (`top`), load averages, memory free (`memory_pressure`), the OpenCode server's memory (port 4198)
  and the five biggest processes. `--no-sudo` skips the temperatures.
- Each run appends one line to `~/.digismith-depot/observability/health.csv`.

## Next

1. **No password prompt:** a sudoers rule that allows only `/usr/bin/powermetrics` without a password (Jack adds it; agents never edit sudoers).
2. **Scheduled samples:** a LaunchAgent every 15 minutes (Jack installs), so the CSV becomes a time series.
3. **A dashboard:** home-lab tools Jack has seen: Grafana with Prometheus and node_exporter (powerful, heavy for an Intel MacBook),
   Netdata (one install, live charts, macOS support), Beszel (light, agent plus hub), Glances (terminal and web, Python). Pick by memory cost
   on this Mac and macOS sensor support (temperatures on Intel need SMC access).
4. Alerts later (CPU die over a threshold, memory free under a threshold, OpenCode server growth).
