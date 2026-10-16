// Run ONCE against the pre-Hono server.ts to store its exact response bytes. Never run after step 5.
import { readFileSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { parsePowermetrics } from '../parse-powermetrics.ts'
import { buildReading } from '../reading.ts'
import { createApiServer, HOST } from '../server.ts'

const NOW = 1_792_000_000_000
const parsed = parsePowermetrics(readFileSync(new URL('./powermetrics-real-sample.txt', import.meta.url), 'utf8'))
const live = { anyOk: true, load: { cpuIdlePct: 85, load1: 3, load5: 3, load15: 3 }, memory: { freePct: 74 }, topProcesses: [], opencodeServer: { port: 4198, rssMb: null } }
const server = createApiServer(async () => buildReading(NOW, { status: 'ok', value: parsed, at: NOW - 2000 }, live))
await new Promise<void>(r => server.listen(0, HOST, r))
const port = (server.address() as AddressInfo).port
const text = await (await fetch(`http://127.0.0.1:${port}/api/v1/power-metrics`)).text()
writeFileSync(new URL('./power-metrics-old-response.json', import.meta.url), text)
server.close()
console.log('stored', text.length, 'bytes')
