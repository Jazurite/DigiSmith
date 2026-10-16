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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = parsePort(process.env.PORT)
  const logger = createLogger()
  const depot = process.env.DIGISMITH_DEPOT ?? join(homedir(), '.digismith-depot')
  const loadProfile = createProfileLoader({
    dataDir: join(depot, 'nexus', 'db'),
    // lazy, so a missing key makes the calendar route answer 503 key_unavailable and never stops the server from starting
    getKey: () => Promise.resolve().then(() => selectKeyProvider(process.env.NEXUS_KEY_PROVIDER, { keyFile: join(depot, 'nexus', 'profile.key') }).getKey()),
  })
  createApiServer(createDefaultReader(), { logger, loadProfile }).listen(port, HOST, () => logger.info('listening', { host: HOST, port }))
}
