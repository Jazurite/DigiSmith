import { createAdaptorServer } from '@hono/node-server'
import type { Server } from 'node:http'
import { pathToFileURL } from 'node:url'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { buildApp, type AppDeps } from './app.ts'
import { createProfileLoader } from './life-calendar-route.ts'
import { selectKeyProvider } from './key-provider.ts'
import { createLogger, type Logger } from './logger.ts'
import { createLive } from './live.ts'
import { createPowermetricsSource, type RunPowermetrics } from './powermetrics-source.ts'
import { buildReading } from './reading.ts'
import type { PowerMetrics } from './types.ts'
import { createEngine } from './scheduler/engine.ts'
import { ensureToken } from './scheduler/guard.ts'
import { createClickupNotifier } from './scheduler/notify.ts'
import { JOBS } from './scheduler/registry.ts'
import { stateDir } from './scheduler/runlog.ts'

export const HOST = '127.0.0.1'
const DEFAULT_PORT = 4300

export function parsePort(value: string | undefined): number {
  if (value === undefined) return DEFAULT_PORT
  const n = Number(value)
  if (!/^\d+$/.test(value) || n < 1 || n > 65535) throw new Error(`PORT must be a whole number from 1 to 65535, got ${JSON.stringify(value)}`)
  return n
}

// Same contract as before the move: a Node http.Server that is not listening yet.
export function createApiServer(getReading: () => Promise<PowerMetrics | null>, deps: AppDeps = {}): Server {
  return createAdaptorServer({ fetch: buildApp(getReading, deps).fetch }) as Server
}

export function createDefaultReader(run?: RunPowermetrics): () => Promise<PowerMetrics | null> {
  const source = createPowermetricsSource(run)
  const live = createLive()
  return async () => {
    const [s, l] = await Promise.all([source(), live.get()])
    return buildReading(Date.now(), s, l)
  }
}

export interface ShutdownDeps {
  stop: () => Promise<void>
  close: (done: () => void) => void
  exit: (code: number) => void
  onStopError: (err: unknown) => void
  graceMs?: number
}

// The timer is armed before the stop, so a hung stop still ends the process. 15 s leaves room for a job's
// SIGTERM-then-SIGKILL (10 s + 2 s) and stays under launchd's 20 s before it sends SIGKILL itself.
export function createShutdown(deps: ShutdownDeps): () => Promise<void> {
  let stopping = false
  return async () => {
    if (stopping) return
    stopping = true
    setTimeout(() => deps.exit(0), deps.graceMs ?? 15_000).unref()
    try { await deps.stop() } catch (err) { deps.onStopError(err) }
    deps.close(() => deps.exit(0))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = parsePort(process.env.PORT)
  const logger = createLogger()
  const depot = process.env.DIGISMITH_DEPOT ?? join(homedir(), '.digismith-depot')
  const loadProfile = createProfileLoader({
    dataDir: join(depot, 'nexus', 'db'),
    // lazy, so a missing key makes the calendar route answer 503 key_unavailable and never stops the server from starting
    getKey: () => Promise.resolve().then(() => selectKeyProvider(process.env.NEXUS_KEY_PROVIDER, { keyFile: join(depot, 'nexus', 'profile.key') }).getKey()),
  })
  process.on('unhandledRejection', (err) => logger.error('scheduler_error', { where: 'unhandled_rejection', code: errorCode(err) }))
  // the state follows DIGISMITH_DEPOT like the profile does, unless NEXUS_STATE_DIR names it
  const dir = process.env.NEXUS_STATE_DIR ? stateDir() : join(depot, 'nexus', 'scheduler')
  const token = ensureToken(dir)
  // A LaunchAgent has a short PATH, so node and dg are absolute.
  const dg = { file: process.execPath, args: ['--experimental-strip-types', join(depot, 'repo', 'packages', 'cli', 'src', 'index.ts')] }
  const engine = createEngine({ jobs: JOBS, stateDir: dir, logger, notify: createClickupNotifier({ dg, logger }) })
  await engine.start()
  const server = createApiServer(createDefaultReader(), { logger, loadProfile, jobs: { engine, jobs: JOBS, token } })
  const shutdown = createShutdown({
    stop: () => engine.stop(),
    close: (done) => server.close(() => done()),
    exit: (code) => process.exit(code),
    onStopError: (err) => logger.error('scheduler_error', { where: 'stop', code: errorCode(err) }),
  })
  process.on('SIGTERM', () => { void shutdown() })
  process.on('SIGINT', () => { void shutdown() })
  server.listen(port, HOST, () => logger.info('listening', { host: HOST, port }))
}

function errorCode(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code
  if (typeof code === 'string') return code
  return err instanceof Error ? err.name : 'unknown'
}
