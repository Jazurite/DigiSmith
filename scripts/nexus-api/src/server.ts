import { createAdaptorServer } from '@hono/node-server'
import type { Server } from 'node:http'
import { pathToFileURL } from 'node:url'
import { buildApp } from './app.ts'
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
export function createApiServer(getReading: () => Promise<PowerMetrics | null>, deps: { logger?: Logger } = {}): Server {
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
  createApiServer(createDefaultReader(), { logger }).listen(port, HOST, () => logger.info('listening', { host: HOST, port }))
}
