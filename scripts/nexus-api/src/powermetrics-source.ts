// The root-only read: `sudo -n /usr/bin/powermetrics ...` (the fixed command in command.ts, allowed by one narrow sudoers rule).
// Arguments are fixed: nothing from a request reaches this call. sudo -n never asks for a password; without the rule it fails at once.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { MAX_OUTPUT_BYTES, SOURCE_TIMEOUT_MS, SUDO, SUDO_ARGS } from './command.ts'
import { parsePowermetrics, type Parsed } from './parse-powermetrics.ts'
import { createSingleFlight, type Outcome } from './source.ts'

export type RunPowermetrics = (signal: AbortSignal) => Promise<string>
const execFileP = promisify(execFile)
const realRun: RunPowermetrics = async signal =>
  (await execFileP(SUDO, SUDO_ARGS, { signal, maxBuffer: MAX_OUTPUT_BYTES, timeout: SOURCE_TIMEOUT_MS + 2000 })).stdout

export function createPowermetricsSource(run: RunPowermetrics = realRun): () => Promise<Outcome<Parsed>> {
  return createSingleFlight(async signal => parsePowermetrics(await run(signal)), { ttlMs: 5000, timeoutMs: SOURCE_TIMEOUT_MS })
}
