// The one fixed powermetrics command (DGS-324). The API runs it through sudo -n; the sudoers rule Jack installs is generated from
// the same constants, so the two cannot drift apart. Never add an argument here without regenerating and re-installing the rule.
export const SUDO = '/usr/bin/sudo'
export const POWERMETRICS = '/usr/bin/powermetrics'
// Not `interrupts` (large per-CPU tables), `sfi`, `gpu_dcc_stats`, `nvme_ssd`, `io_throttle_ssd` (little value, unverified on this Mac).
export const SAMPLERS = ['tasks', 'battery', 'network', 'disk', 'cpu_power', 'gpu_power', 'gpu_agpm_stats', 'smc', 'thermal'] as const
export const POWERMETRICS_ARGS = ['--samplers', SAMPLERS.join(','), '-i', '1000', '-n', '1']
export const SUDO_ARGS = ['-n', POWERMETRICS, ...POWERMETRICS_ARGS]
// One sample takes about 1 s plus start-up; 10 s leaves room for nine samplers on a busy Mac. Re-checked against Jack's timed run (J1b).
export const SOURCE_TIMEOUT_MS = 10_000
export const MAX_OUTPUT_BYTES = 4 * 1024 * 1024

// sudoers needs a comma inside an argument escaped as `\,`.
export function sudoersLine(user: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(user)) throw new Error(`not a plain user name: ${JSON.stringify(user)}`)
  return `${user} ALL=(root) NOPASSWD: ${POWERMETRICS} ${POWERMETRICS_ARGS.map(a => a.replace(/,/g, '\\,')).join(' ')}`
}
