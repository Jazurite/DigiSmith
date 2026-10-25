# The scan interval is a config setting (30 minutes)

**Key:** DGS-644
**List:** B.6: Nightwatch

Jack, 2026-10-25: "scans every 30m", then "make that into a config".

The Nexus job `autonomous-scan` runs every 30 minutes instead of every 5. The interval is the setting `nightwatch.scan_every_minutes` in `.digismith/config.yml`, not a hard-coded number. After a release the factory still rescans at once. The jobs `nightwatch-watchdog`, `schedule-release` and `oculus-tokens` keep their 5-minute cycles.
