#!/bin/bash
# workbox-health: one look at the Mac Workbox's heat, fan, CPU idle and memory (DGS-319, clan G, G.2: Observability).
# Source lives in the repo; install.sh copies it to ~/.digismith-depot/bin/workbox-health (the depot runs it, DGS-265).
# Usage: workbox-health [--no-sudo]   (temperatures need sudo powermetrics; --no-sudo skips them)
# Each run prints a summary and appends one CSV line to ~/.digismith-depot/observability/health.csv.
set -u

LOG_DIR="$HOME/.digismith-depot/observability"
LOG="$LOG_DIR/health.csv"
mkdir -p "$LOG_DIR"
[ -f "$LOG" ] || echo "time_utc7,cpu_c,gpu_c,fan_rpm,pressure,cpu_level,prochots,cpu_idle_pct,load1,load5,load15,mem_free_pct,opencode_mb" > "$LOG"

now=$(TZ=Asia/Ho_Chi_Minh date '+%Y-%m-%d %H:%M:%S')

cpu_c=""; gpu_c=""; fan=""; pressure=""; cpu_level=""; prochots=""
if [ "${1:-}" != "--no-sudo" ]; then
  pm=$(sudo powermetrics --samplers smc,thermal -i 1000 -n 1 2>/dev/null)
  cpu_c=$(printf '%s\n' "$pm" | awk -F': ' '/CPU die temperature/ {sub(/ C/,"",$2); print $2; exit}')
  gpu_c=$(printf '%s\n' "$pm" | awk -F': ' '/GPU die temperature/ {sub(/ C/,"",$2); print $2; exit}')
  fan=$(printf '%s\n' "$pm" | awk -F': ' '/^Fan/ {sub(/ rpm/,"",$2); print $2; exit}')
  pressure=$(printf '%s\n' "$pm" | awk -F': ' '/Current pressure level/ {print $2; exit}')
  cpu_level=$(printf '%s\n' "$pm" | awk -F': ' '/CPU Thermal level/ {print $2; exit}')
  prochots=$(printf '%s\n' "$pm" | awk -F': ' '/Number of prochots/ {print $2; exit}')
fi

idle=$(top -l 2 -n 0 -s 1 | awk '/CPU usage/ {v=$7} END {sub(/%/,"",v); print v}')
read -r load1 load5 load15 <<< "$(sysctl -n vm.loadavg | tr -d '{}')"
memfree=$(memory_pressure 2>/dev/null | awk -F': ' '/free percentage/ {sub(/%/,"",$2); print $2}')
oc_pid=$(lsof -nP -iTCP:4198 -sTCP:LISTEN -t 2>/dev/null | head -1)
oc_mb=""; [ -n "$oc_pid" ] && oc_mb=$(ps -o rss= -p "$oc_pid" | awk '{printf "%d", $1/1024}')

echo "Workbox health, $now UTC+7"
if [ -n "$cpu_c" ]; then
  echo "  CPU die ${cpu_c} C   GPU die ${gpu_c} C   fan ${fan} rpm"
  echo "  thermal pressure ${pressure}, CPU level ${cpu_level}, prochots ${prochots}"
else
  echo "  temperatures skipped (needs sudo powermetrics)"
fi
echo "  CPU idle ${idle}%   load ${load1} ${load5} ${load15}   memory free ${memfree}%"
[ -n "$oc_mb" ] && echo "  OpenCode server (port 4198) ${oc_mb} MB"
echo "  biggest processes:"
ps -Ao rss,%cpu,comm | sort -rn | head -5 | awk '{n=$3; sub(/.*\//,"",n); printf "    %6d MB %5s%% %s\n", $1/1024, $2, n}'

echo "$now,$cpu_c,$gpu_c,$fan,$pressure,$cpu_level,$prochots,$idle,$load1,$load5,$load15,$memfree,$oc_mb" >> "$LOG"
echo "  logged to $LOG"
