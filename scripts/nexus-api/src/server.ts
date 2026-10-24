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
import { createEngine, type Engine } from './scheduler/engine.ts'
import { ensureToken } from './scheduler/guard.ts'
import { createClickupNotifier } from './scheduler/notify.ts'
import { JOBS } from './scheduler/registry.ts'
import type { JobDef } from './scheduler/types.ts'
import { createReader } from './oculus-reader.ts'
import { createSnapshotStore, snapshotDir, webRootsOf } from './oculus-snapshot.ts'
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

export interface NexusOptions {
  getReading: () => Promise<PowerMetrics | null>
  logger: Logger
  loadProfile?: AppDeps['loadProfile']
  stateDir: string
  dg: { file: string; args: string[] }
  jobs?: readonly JobDef[]
  depot?: string
}

export async function startNexus(opts: NexusOptions): Promise<{ server: Server; scheduler: boolean; stop: () => Promise<void> }> {
  const { logger } = opts
  const list = opts.jobs ?? JOBS
  let jobs: AppDeps['jobs']
  let engine: Engine | null = null
  try {
    const token = ensureToken(opts.stateDir)
    engine = createEngine({ jobs: list, stateDir: opts.stateDir, logger, notify: createClickupNotifier({ dg: opts.dg, logger }) })
    await engine.start()
    jobs = { engine, jobs: list, token }
  } catch (err) {
    logger.error('scheduler_error', { where: 'start', code: errorCode(err) })
    if (engine) await engine.stop().catch(() => undefined)
    engine = null
  }
  const eng = engine
  const depot = opts.depot ?? join(homedir(), '.digismith-depot')
  const oculus = { read: createReader(), snapshot: createSnapshotStore(snapshotDir(depot), { webRoots: webRootsOf(depot) }), ...(eng ? { jobs: () => eng.snapshot() } : {}) }
  const server = createApiServer(opts.getReading, { logger, ...(opts.loadProfile ? { loadProfile: opts.loadProfile } : {}), ...(jobs ? { jobs } : {}), oculus })
  const running = engine
  return { server, scheduler: running !== null, stop: () => (running ? running.stop() : Promise.resolve()) }
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
  // A LaunchAgent has a short PATH, so node and dg are absolute.
  const dg = { file: process.execPath, args: ['--experimental-strip-types', join(depot, 'repo', 'packages', 'cli', 'src', 'index.ts')] }
  // test-only switch: a module exporting JOBS replaces the real registry; unset in production
  const jobs = process.env.NEXUS_JOBS_MODULE ? ((await import(pathToFileURL(process.env.NEXUS_JOBS_MODULE).href)) as { JOBS: readonly JobDef[] }).JOBS : undefined
  const nexus = await startNexus({ getReading: createDefaultReader(), logger, loadProfile, stateDir: dir, dg, depot, ...(jobs ? { jobs } : {}) })
  const server = nexus.server
  const shutdown = createShutdown({
    stop: () => nexus.stop(),
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
