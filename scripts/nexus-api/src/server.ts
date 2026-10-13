import { createServer, type Server } from 'node:http'
import { pathToFileURL } from 'node:url'
import { createLive } from './live.ts'
import { createPowermetricsSource, type RunPowermetrics } from './powermetrics-source.ts'
import { buildReading } from './reading.ts'
import type { ApiError, PowerMetrics } from './types.ts'
import { API_VERSION } from './version.ts'

export const HOST = '127.0.0.1'
const DEFAULT_PORT = 4300

export function parsePort(value: string | undefined): number {
  if (value === undefined) return DEFAULT_PORT
  const n = Number(value)
  if (!/^\d+$/.test(value) || n < 1 || n > 65535) throw new Error(`PORT must be a whole number from 1 to 65535, got ${JSON.stringify(value)}`)
  return n
}
const PATH = `/api/${API_VERSION}/power-metrics`

function send(res: import('node:http').ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers })
  res.end(JSON.stringify(body))
}

export function createApiServer(getReading: () => Promise<PowerMetrics | null>): Server {
  return createServer(async (req, res) => {
    const path = (req.url ?? '').split('?')[0]
    if (path !== PATH) return send(res, 404, { error: 'not_found' })
    if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' })
    let reading: PowerMetrics | null = null
    try { reading = await getReading() } catch { reading = null }
    if (!reading) {
      const err: ApiError = { error: 'no_reading', message: 'no reading could be built' }
      return send(res, 503, err, { 'Retry-After': '5' })
    }
    send(res, 200, reading)
  })
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
  createApiServer(createDefaultReader()).listen(port, HOST, () => console.log(`nexus-api listening on ${HOST}:${port}${PATH}`))
}
